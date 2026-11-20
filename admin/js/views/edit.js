// Bewerkscherm voor een pagina of bericht.

import { h, icon, toast, modal, confirmDialog, field, setFieldError, statusBadge, timeAgo, fill, clear } from '../ui.js';
import { TYPES, normalizeItem, validateItem, slugify } from '../lib/content.js';
import { ConflictError } from '../lib/github.js';
import { createEditor } from '../editor.js';
import { openMediaPicker } from './media.js';

export function editView(ctx, type, slug) {
  const { store, config } = ctx;
  const t = TYPES[type];
  const existing = slug ? store.get(type, slug) : null;

  if (slug && !existing) {
    return {
      el: h('div', { class: 'view' },
        backLink(type),
        h('div', { class: 'card' },
          h('h1', {}, `${cap(t.single)} niet gevonden`),
          h('p', {}, `Er is geen ${t.single} met het adres "${slug}". Misschien is hij verwijderd of hernoemd.`),
          h('a', { class: 'btn', href: `#/${type}` }, `Naar alle ${t.plural}`))),
    };
  }

  // Nieuwe pagina: standaard achteraan in het menu (niet op dezelfde plek als een bestaande pagina)
  const lastOrder = Math.max(0, ...store.list(type).map((i) => Number(i.menuOrder) || 0));
  let item = normalizeItem(type, existing ? existing.item : { title: '', slug: '', status: 'draft', body: '', menuOrder: lastOrder + 10 });
  let originalSlug = existing ? existing.item.slug : null;
  let slugTouched = Boolean(existing);
  let dirty = false;
  let saving = false;

  const markDirty = () => { if (!dirty) { dirty = true; updateStatus(); } };
  const fixed = type === 'pages' && Boolean(item.fixed);

  // ---------- Velden ----------
  const titleInput = h('input', { type: 'text', class: 'title-input', value: item.title, placeholder: fixed ? 'Naam in het menu' : 'Titel', 'aria-label': fixed ? 'Naam in het menu' : 'Titel', maxlength: 200 });
  const titleErr = h('p', { class: 'field-error', hidden: true });
  const slugInput = h('input', { type: 'text', value: item.slug, spellcheck: 'false', autocapitalize: 'off' });
  const slugPrefix = type === 'posts' ? '/blog/' : '/';
  const slugField = field({ label: 'Adres (URL)', input: slugInput, help: `Wordt ${slugPrefix}${item.slug || 'adres'}/ op de website. Wordt automatisch gemaakt uit de titel.` });
  const slugHelp = slugField.querySelector('.field-help');
  if (fixed) slugInput.disabled = true;
  const updateSlugHelp = () => {
    if (fixed) { slugHelp.textContent = 'Vaste pagina van de website: het adres blijft hetzelfde.'; return; }
    const s = slugInput.value || 'adres';
    slugHelp.textContent = type === 'pages' && s === store.site.homepage
      ? 'Dit is de homepagina van de website.'
      : `Wordt ${slugPrefix}${s}/ op de website. Wordt automatisch gemaakt uit de titel.`;
  };

  titleInput.addEventListener('input', () => {
    if (!slugTouched) { slugInput.value = slugify(titleInput.value); updateSlugHelp(); }
    titleErr.hidden = true;
    markDirty();
  });
  slugInput.addEventListener('input', () => { slugTouched = true; updateSlugHelp(); setFieldError(slugField, ''); markDirty(); });
  slugInput.addEventListener('blur', () => { slugInput.value = slugify(slugInput.value); updateSlugHelp(); });

  const descInput = h('textarea', { rows: 3, maxlength: 300 }, item.description);
  descInput.addEventListener('input', markDirty);
  const descField = field({ label: 'Omschrijving voor Google', input: descInput, optional: true, help: 'Korte samenvatting die zoekmachines tonen. Maximaal 300 tekens.' });

  const editor = createEditor({ html: item.body, store, onChange: markDirty });
  const fixedNote = fixed
    ? h('div', { class: 'notice notice-info' },
      h('strong', {}, 'Vaste pagina. '),
      'Deze pagina heeft een eigen ontwerp. Prijzen, gerechten en openingstijden past u aan via de onderdelen in het menu links. ',
      'Hieronder kunt u extra tekst toevoegen; die komt onderaan de pagina. Leeg laten = geen extra tekst.')
    : null;

  // Pagina-specifiek
  let menuCheck;
  // Bericht-specifiek
  let dateInput; let excerptInput; let imageValue = item.image || ''; let imageBox;

  const sidePanels = [];
  if (type === 'pages') {
    menuCheck = h('input', { type: 'checkbox', id: 'in-menu', checked: item.inMenu, onchange: markDirty });
    sidePanels.push(panel('Menu',
      h('label', { class: 'check' }, menuCheck, ' Toon deze pagina in het menu'),
      h('p', { class: 'small muted' }, 'De volgorde in het menu verander je door de pagina’s te slepen in de lijst ', h('a', { href: '#/pages' }, 'Pagina’s'), '.')));
  } else {
    dateInput = h('input', { type: 'date', value: item.date, oninput: markDirty });
    excerptInput = h('textarea', { rows: 3, maxlength: 400, oninput: markDirty }, item.excerpt);
    imageBox = h('div', { class: 'featured-box' });
    const renderImage = () => {
      clear(imageBox);
      if (imageValue) {
        const img = h('img', { alt: '' });
        store.mediaObjectUrl(imageValue).then((u) => { if (u) img.src = u; }).catch(() => {});
        imageBox.append(img,
          h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn btn-small', onclick: pickImage }, 'Andere foto'),
            h('button', { type: 'button', class: 'btn btn-small btn-danger-outline', onclick: () => { imageValue = ''; renderImage(); markDirty(); } }, 'Weghalen')));
      } else {
        imageBox.append(h('button', { type: 'button', class: 'btn', onclick: pickImage }, 'Foto kiezen'));
      }
    };
    async function pickImage() {
      const picked = await openMediaPicker(store, { maxWidth: config.maxImageWidth });
      if (picked) { imageValue = picked.url; renderImage(); markDirty(); }
    }
    renderImage();
    sidePanels.push(panel('Bericht',
      field({ label: 'Datum', input: dateInput }),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Uitgelichte foto', h('span', { class: 'optional' }, ' (optioneel)')), imageBox),
      field({ label: 'Korte samenvatting', input: excerptInput, optional: true, help: 'Wordt getoond in het overzicht. Leeg laten = begin van de tekst.' })));
  }
  sidePanels.push(fixed ? panel('Adres', slugField) : panel('Zoekmachines en adres', slugField, descField));

  // ---------- Publiceren-paneel ----------
  const statusLine = h('div', { class: 'publish-status' });
  const savedLine = h('p', { class: 'muted small' });
  const primaryBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: () => save('published') }, 'Opslaan en online zetten');
  const draftBtn = h('button', { type: 'button', class: 'btn btn-block', onclick: () => save('draft') });
  const previewBtn = h('button', { type: 'button', class: 'btn btn-block btn-ghost', onclick: preview }, 'Voorbeeld bekijken');
  if (fixed) { draftBtn.hidden = true; draftBtn.style.display = 'none'; }
  const deleteBtn = existing && !fixed ? h('button', { type: 'button', class: 'link-danger', onclick: remove }, `${cap(t.single)} verwijderen`) : null;

  function updateStatus() {
    fill(statusLine, 
      h('span', {}, 'Status: '), statusBadge(item.status),
      dirty ? h('span', { class: 'badge badge-unsaved' }, 'Niet opgeslagen wijzigingen') : null);
    draftBtn.textContent = item.status === 'published' && existing ? 'Offline halen (concept maken)' : 'Opslaan als concept';
    primaryBtn.textContent = item.status === 'published' && existing ? 'Wijzigingen online zetten' : 'Opslaan en online zetten';
    savedLine.textContent = existing || originalSlug ? `Laatst opgeslagen: ${timeAgo(item.updated)}` : 'Nog niet opgeslagen.';
    for (const b of [primaryBtn, draftBtn]) b.disabled = saving;
  }

  function collect() {
    const data = {
      ...item,
      title: titleInput.value.trim(),
      slug: slugify(slugInput.value || titleInput.value),
      description: descInput.value.trim(),
      body: editor.getHtml(),
    };
    if (type === 'pages') {
      data.inMenu = menuCheck.checked;
      data.menuOrder = item.menuOrder; // volgorde wordt in de lijst gesleept
    } else {
      data.date = dateInput.value || new Date().toISOString().slice(0, 10);
      data.excerpt = excerptInput.value.trim();
      data.image = imageValue;
    }
    return data;
  }

  async function save(status) {
    if (saving) return;
    const data = { ...collect(), status };
    slugInput.value = data.slug;
    const others = store.list(type).map((i) => i.slug).filter((s) => s !== originalSlug);
    const errors = validateItem(type, data, others);
    titleErr.textContent = errors.title || '';
    titleErr.hidden = !errors.title;
    setFieldError(slugField, errors.slug);
    setFieldError(descField, errors.description);
    if (Object.keys(errors).length) {
      toast('Controleer de rood gemarkeerde velden.', 'error');
      (errors.title ? titleInput : slugInput).focus();
      return;
    }
    if (originalSlug && data.slug !== originalSlug && existing && existing.item.status === 'published') {
      const ok = await confirmDialog('Adres wijzigen?', `Het adres verandert van "${originalSlug}" naar "${data.slug}". Links naar het oude adres werken daarna niet meer.`, 'Adres wijzigen');
      if (!ok) return;
    }
    saving = true;
    updateStatus();
    ctx.setSaving(true);
    try {
      const saved = await store.saveItem(type, data, originalSlug);
      item = saved.item;
      originalSlug = item.slug;
      dirty = false;
      toast(status === 'published' ? `"${item.title}" is opgeslagen en wordt online gezet.` : `"${item.title}" is opgeslagen als concept.`, 'success');
      if (location.hash !== `#/${type}/edit/${encodeURIComponent(item.slug)}`) {
        ctx.navigate(`#/${type}/edit/${encodeURIComponent(item.slug)}`, { replace: true, force: true });
        return;
      }
    } catch (e) {
      if (e instanceof ConflictError) {
        await modal({
          title: 'Iemand anders was je voor',
          body: h('div', {},
            h('p', {}, 'Deze inhoud is intussen door iemand anders (of in een ander tabblad) gewijzigd of het adres is al in gebruik.'),
            h('p', {}, 'Je wijzigingen zijn nog niet opgeslagen. Kopieer eventueel je tekst, en klik daarna op "Vernieuwen" in de bovenbalk om de nieuwste versie te laden.')),
          buttons: [{ label: 'Begrepen', value: null, class: 'btn-primary' }],
        });
      } else {
        toast('Opslaan mislukt: ' + e.message, 'error', 12000);
      }
    } finally {
      saving = false;
      ctx.setSaving(false);
      updateStatus();
    }
  }

  async function remove() {
    const ok = await confirmDialog(`${cap(t.single)} verwijderen`, `Weet je zeker dat je "${item.title}" wilt verwijderen?`, 'Verwijderen', { danger: true });
    if (!ok) return;
    try {
      await store.deleteItem(type, originalSlug);
      dirty = false;
      toast(`"${item.title}" is verwijderd.`, 'success');
      ctx.navigate(`#/${type}`, { force: true });
    } catch (e) {
      toast('Verwijderen mislukt: ' + e.message, 'error', 10000);
    }
  }

  function preview() {
    const data = collect();
    const frame = h('iframe', { class: 'preview-frame', title: 'Voorbeeld', sandbox: 'allow-same-origin' });
    const css = new URL(config.pagePreviewCss || '../assets/site.css', location.href).href;
    const bodyHtml = editor.contentEl.innerHTML; // met tijdelijke foto-adressen zodat foto's zichtbaar zijn
    const doc = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><link rel="stylesheet" href="${css}"><style>body{padding:24px} a{pointer-events:none}</style></head><body><main class="wrap"><article class="entry prose"><h1></h1><div class="entry-body"></div></article></main></body></html>`;
    frame.srcdoc = doc;
    frame.addEventListener('load', () => {
      const d = frame.contentDocument;
      if (!d) return;
      d.querySelector('h1').textContent = data.title || '(zonder titel)';
      d.querySelector('.entry-body').innerHTML = bodyHtml;
    });
    modal({ title: 'Voorbeeld', body: h('div', {}, h('p', { class: 'muted small' }, 'Zo ongeveer komt het eruit te zien. Dit voorbeeld is nog niet opgeslagen.'), frame), wide: true });
  }

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save(item.status === 'published' ? 'published' : 'draft');
    }
  };
  document.addEventListener('keydown', onKey);

  updateSlugHelp();
  updateStatus();

  const title = fixed ? `Vaste pagina: ${item.title}` : existing ? `${cap(t.single)} bewerken` : `Nieuw${type === 'pages' ? 'e' : ''} ${t.single}`;
  const el = h('div', { class: 'view view-edit' },
    backLink(type),
    h('div', { class: 'view-header' }, h('h1', {}, title)),
    h('div', { class: 'edit-layout' },
      h('div', { class: 'edit-main' },
        titleInput, titleErr,
        fixedNote,
        editor.el),
      h('aside', { class: 'edit-side', 'aria-label': 'Instellingen' },
        panel('Publiceren', statusLine, savedLine, primaryBtn, draftBtn, previewBtn, deleteBtn ? h('div', { class: 'danger-zone' }, deleteBtn) : null),
        ...sidePanels)));

  if (!existing) setTimeout(() => titleInput.focus(), 0);

  return {
    el,
    canLeave: () => !dirty,
    destroy: () => document.removeEventListener('keydown', onKey),
  };
}

function panel(title, ...children) {
  return h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, title), h('div', { class: 'panel-body' }, ...children));
}

function backLink(type) {
  return h('a', { class: 'back-link', href: `#/${type}` }, icon('back', 18), `Terug naar ${TYPES[type].plural}`);
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }

