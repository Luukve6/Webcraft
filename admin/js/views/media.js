// Foto's: bibliotheek, uploaden, verwijderen en de fotokiezer voor de editor.

import { h, clear, toast, modal, confirmDialog, formatSize, field } from '../ui.js';

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
const MAX_BYTES = 15 * 1024 * 1024; // na verkleinen

/** Verkleint grote foto's in de browser voordat ze worden geüpload. */
export async function prepareImage(file, maxWidth = 2000) {
  if (!ACCEPT.split(',').includes(file.type)) {
    throw new Error(`"${file.name}" is geen ondersteunde foto. Gebruik JPG, PNG, GIF of WebP.`);
  }
  let bytes = new Uint8Array(await file.arrayBuffer());
  let name = file.name;
  if (file.type !== 'image/gif') {
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > maxWidth) {
        const scale = maxWidth / bitmap.width;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const blob = await new Promise((r) => canvas.toBlob(r, type, 0.85));
        if (blob && blob.size < bytes.length) {
          bytes = new Uint8Array(await blob.arrayBuffer());
          if (type === 'image/jpeg') name = name.replace(/\.(png|webp)$/i, '.jpg');
        }
      }
      bitmap.close && bitmap.close();
    } catch { /* verkleinen niet gelukt: origineel gebruiken */ }
  }
  if (bytes.length > MAX_BYTES) throw new Error(`"${file.name}" is te groot (${formatSize(bytes.length)}). Maximaal ${formatSize(MAX_BYTES)}.`);
  return { name, bytes };
}

export async function uploadFiles(store, fileList, maxWidth) {
  const files = [...fileList];
  if (!files.length) return [];
  const prepared = [];
  for (const f of files) {
    try { prepared.push(await prepareImage(f, maxWidth)); } catch (e) { toast(e.message, 'error', 8000); }
  }
  if (!prepared.length) return [];
  const t = toast(prepared.length === 1 ? 'Foto wordt opgeslagen…' : `${prepared.length} foto's worden opgeslagen…`, 'info', 0);
  try {
    const urls = await store.uploadMedia(prepared);
    toast(prepared.length === 1 ? 'Foto opgeslagen.' : `${prepared.length} foto's opgeslagen.`, 'success');
    return urls;
  } catch (e) {
    toast('Uploaden mislukt: ' + e.message, 'error', 10000);
    return [];
  } finally {
    t.remove();
  }
}

function thumb(store, m) {
  const img = h('img', { alt: '', loading: 'lazy' });
  store.mediaObjectUrl(m.url).then((u) => { if (u) img.src = u; }).catch(() => {});
  return img;
}

function dropZone(onFiles, label) {
  const input = h('input', { type: 'file', accept: ACCEPT, multiple: true, class: 'visually-hidden', onchange: () => { onFiles(input.files); input.value = ''; } });
  const zone = h('label', { class: 'dropzone' },
    input,
    h('strong', {}, label),
    h('span', {}, 'Sleep foto’s hierheen of klik om te kiezen. JPG, PNG, GIF of WebP. Grote foto’s worden automatisch verkleind.'));
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('drag'); onFiles(e.dataTransfer.files); });
  return zone;
}

/** De pagina "Foto's" in het menu. */
export function mediaView(ctx) {
  const { store, config } = ctx;
  const root = h('div', { class: 'view' });
  const grid = h('div', { class: 'media-grid' });
  const countEl = h('p', { class: 'muted' });

  async function remove(m) {
    const used = store.usageOf(m.url);
    const msg = used.length
      ? `Let op: deze foto wordt nog gebruikt in: ${used.map((u) => u.item.title).join(', ')}. Daar verdwijnt hij dan ook. Weet je het zeker?`
      : `Weet je zeker dat je "${m.name}" wilt verwijderen?`;
    if (!(await confirmDialog('Foto verwijderen', msg, 'Verwijderen', { danger: true }))) return;
    try {
      await store.deleteMedia(m.path);
      toast('Foto verwijderd.', 'success');
      render();
    } catch (e) {
      toast('Verwijderen mislukt: ' + e.message, 'error', 10000);
    }
  }

  function render() {
    const media = store.media();
    countEl.textContent = media.length === 1 ? '1 foto' : `${media.length} foto's`;
    clear(grid);
    if (!media.length) grid.append(h('p', { class: 'empty' }, 'Er zijn nog geen foto’s. Upload hierboven je eerste foto.'));
    for (const m of media) {
      grid.append(h('figure', { class: 'media-item' },
        h('div', { class: 'media-thumb' }, thumb(store, m)),
        h('figcaption', {},
          h('span', { class: 'media-name', title: m.name }, m.name),
          h('span', { class: 'muted' }, formatSize(m.size))),
        h('div', { class: 'media-actions' },
          h('button', { class: 'btn btn-small', type: 'button', onclick: async () => {
            try { await navigator.clipboard.writeText(m.url); toast('Adres gekopieerd: ' + m.url, 'success'); } catch { toast('Adres: ' + m.url, 'info', 10000); }
          } }, 'Kopieer adres'),
          h('button', { class: 'btn btn-small btn-danger-outline', type: 'button', onclick: () => remove(m) }, 'Verwijderen'))));
    }
  }

  root.append(
    h('div', { class: 'view-header' }, h('h1', {}, 'Foto’s'), countEl),
    dropZone(async (files) => { await uploadFiles(store, files, config.maxImageWidth); render(); }, 'Foto’s uploaden'),
    grid,
  );
  render();
  return { el: root };
}

/**
 * Venster om een foto te kiezen (of nieuw te uploaden).
 * Geeft {url, alt} terug, of null bij annuleren.
 */
export function openMediaPicker(store, { withAlt = false, maxWidth = 2000 } = {}) {
  let selected = null;
  const grid = h('div', { class: 'media-grid media-grid-small' });
  const altInput = h('input', { type: 'text', placeholder: 'Bijv. "Ons team bij de opening"' });

  function render() {
    clear(grid);
    const media = store.media();
    if (!media.length) grid.append(h('p', { class: 'empty' }, 'Nog geen foto’s. Upload er hierboven een.'));
    for (const m of media) {
      const item = h('button', { type: 'button', class: 'media-pick' + (selected === m.url ? ' selected' : ''), 'aria-pressed': selected === m.url ? 'true' : 'false', title: m.name, onclick: () => { selected = m.url; render(); } },
        h('div', { class: 'media-thumb' }, thumb(store, m)),
        h('span', { class: 'media-name' }, m.name));
      grid.append(item);
    }
  }

  const body = h('div', {},
    dropZone(async (files) => {
      const urls = await uploadFiles(store, files, maxWidth);
      if (urls.length) selected = urls[urls.length - 1];
      render();
    }, 'Nieuwe foto uploaden'),
    h('h3', { class: 'picker-title' }, 'Of kies een bestaande foto'),
    grid,
    withAlt ? field({ label: 'Korte omschrijving van de foto', input: altInput, help: 'Voor mensen die slecht zien en voor zoekmachines.', optional: true }) : null);
  render();

  return modal({
    title: 'Foto kiezen',
    body,
    wide: true,
    buttons: [
      { label: 'Annuleren', value: null },
      { label: 'Deze foto gebruiken', class: 'btn-primary', value: () => (selected ? { url: selected, alt: altInput.value.trim() } : null) },
    ],
  });
}
