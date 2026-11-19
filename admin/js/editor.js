// Visuele teksteditor ("wat je ziet is wat je krijgt").
// Gebouwd op contenteditable met een eigen werkbalk. Bij plakken en bij
// opslaan wordt de HTML opgeschoond, zodat alleen nette opmaak overblijft.

import { h, modal, field, toast } from './ui.js';
import { sanitizeHtml, escapeHtml, isSafeUrl } from './lib/sanitize.js';
import { openMediaPicker } from './views/media.js';

// Leeg plaatje dat getoond wordt totdat de echte foto uit GitHub is geladen.
const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/** Zet src="/media/..." om naar data-cms-src, zodat de browser niet een (nog) niet gepubliceerd adres probeert te laden. */
function deferMedia(html, prefix = '/media') {
  const esc = prefix.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return html.replace(new RegExp(`<img([^>]*?) src="(${esc}/[^"]*)"`, 'g'), `<img$1 src="${PLACEHOLDER}" data-cms-src="$2"`);
}

const BLOCKS = [
  ['p', 'Gewone tekst'],
  ['h2', 'Kop (groot)'],
  ['h3', 'Kop (middel)'],
  ['h4', 'Kop (klein)'],
  ['blockquote', 'Citaat'],
];

export function createEditor({ html = '', store, onChange = () => {} }) {
  const content = h('div', {
    class: 'editor-content entry-body',
    contenteditable: 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': 'Tekst',
    spellcheck: 'true',
    lang: 'nl',
  });

  const exec = (cmd, value = null) => {
    content.focus();
    document.execCommand(cmd, false, value);
    changed();
    updateToolbar();
  };

  let savedRange = null;
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel.rangeCount && content.contains(sel.getRangeAt(0).commonAncestorContainer)) savedRange = sel.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    content.focus();
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  };

  const btn = (label, title, onclick, cls = '') =>
    h('button', { type: 'button', class: `tb-btn ${cls}`, title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick }, label);

  const blockSelect = h('select', { class: 'tb-select', 'aria-label': 'Soort tekst', onchange: () => { restoreSelection(); exec('formatBlock', `<${blockSelect.value}>`); } },
    BLOCKS.map(([v, l]) => h('option', { value: v }, l)));
  blockSelect.addEventListener('mousedown', saveSelection);

  const stateButtons = {
    bold: btn(h('b', {}, 'B'), 'Vet (Ctrl+B)', () => exec('bold')),
    italic: btn(h('i', {}, 'I'), 'Schuin (Ctrl+I)', () => exec('italic')),
    underline: btn(h('u', {}, 'O'), 'Onderstrepen (Ctrl+U)', () => exec('underline')),
    insertUnorderedList: btn('• Lijst', 'Opsomming met bolletjes', () => exec('insertUnorderedList')),
    insertOrderedList: btn('1. Lijst', 'Genummerde lijst', () => exec('insertOrderedList')),
  };

  const toolbar = h('div', { class: 'editor-toolbar', role: 'toolbar', 'aria-label': 'Opmaak' },
    blockSelect,
    h('span', { class: 'tb-sep' }),
    stateButtons.bold, stateButtons.italic, stateButtons.underline,
    h('span', { class: 'tb-sep' }),
    stateButtons.insertUnorderedList, stateButtons.insertOrderedList,
    h('span', { class: 'tb-sep' }),
    btn('Link', 'Link toevoegen of wijzigen', () => linkDialog()),
    btn('Foto', 'Foto invoegen', () => imageDialog()),
    btn('Lijn', 'Scheidingslijn invoegen', () => exec('insertHorizontalRule')),
    h('span', { class: 'tb-sep' }),
    btn('↶', 'Ongedaan maken (Ctrl+Z)', () => exec('undo')),
    btn('↷', 'Opnieuw (Ctrl+Y)', () => exec('redo')),
    btn('Opmaak wissen', 'Opmaak van geselecteerde tekst wissen', () => { exec('removeFormat'); exec('unlink'); }),
  );

  function updateToolbar() {
    for (const [cmd, b] of Object.entries(stateButtons)) {
      let on = false;
      try { on = document.queryCommandState(cmd); } catch { /* */ }
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    const sel = window.getSelection();
    if (sel.rangeCount && content.contains(sel.anchorNode)) {
      let n = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      while (n && n !== content && !BLOCKS.some(([t]) => t === n.tagName.toLowerCase())) n = n.parentElement;
      blockSelect.value = n && n !== content ? n.tagName.toLowerCase() : 'p';
    }
  }

  let changeTimer = null;
  function changed() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(onChange, 150);
  }

  content.addEventListener('input', changed);
  content.addEventListener('keyup', updateToolbar);
  content.addEventListener('mouseup', updateToolbar);
  content.addEventListener('blur', saveSelection);
  content.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); linkDialog(); }
  });

  // Plakken: altijd opschonen
  content.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    e.preventDefault();
    const html = cd.getData('text/html');
    if (html) {
      document.execCommand('insertHTML', false, sanitizeHtml(html));
    } else {
      const text = cd.getData('text/plain');
      const paras = text.split(/\r?\n\s*\r?\n/).map((p) => escapeHtml(p).replace(/\r?\n/g, '<br>'));
      document.execCommand('insertHTML', false, paras.length > 1 ? paras.map((p) => `<p>${p}</p>`).join('') : paras[0]);
    }
    changed();
  });

  // Foto's slepen in de tekst: niet toestaan (gebruik de knop Foto)
  content.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      e.preventDefault();
      toast('Gebruik de knop "Foto" in de werkbalk om een foto toe te voegen.', 'info');
    }
  });

  async function linkDialog() {
    saveSelection();
    const sel = window.getSelection();
    const selectedText = sel ? sel.toString() : '';
    let anchor = sel && sel.anchorNode ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest('a') : null;
    if (anchor && !content.contains(anchor)) anchor = null;

    const urlInput = h('input', { type: 'text', value: anchor ? anchor.getAttribute('href') : '', placeholder: 'https://… of kies hieronder een pagina' });
    const pages = store ? store.list('pages').filter((p) => p.status === 'published') : [];
    const homeSlug = store ? store.site.homepage : 'home';
    const internal = h('select', { onchange: () => { if (internal.value) urlInput.value = internal.value; } },
      h('option', { value: '' }, '— Kies een pagina van deze website —'),
      pages.map((p) => h('option', { value: p.slug === homeSlug ? '/' : `/${p.slug}/` }, p.title)),
      store && store.list('posts').filter((p) => p.status === 'published').map((p) => h('option', { value: `/blog/${p.slug}/` }, `Bericht: ${p.title}`)));
    const textInput = h('input', { type: 'text', value: selectedText });
    const body = h('div', {},
      field({ label: 'Adres van de link', input: urlInput, help: 'Bijvoorbeeld https://www.voorbeeld.nl of een e-mailadres als mailto:naam@voorbeeld.nl' }),
      field({ label: 'Of link naar een eigen pagina', input: internal, optional: true }),
      !selectedText && !anchor ? field({ label: 'Tekst van de link', input: textInput }) : null);

    const buttons = [{ label: 'Annuleren', value: null }];
    if (anchor) buttons.push({ label: 'Link verwijderen', value: 'remove', class: 'btn-danger-outline' });
    buttons.push({ label: anchor ? 'Link bijwerken' : 'Link toevoegen', value: 'ok', class: 'btn-primary' });
    const result = await modal({ title: anchor ? 'Link wijzigen' : 'Link toevoegen', body, buttons });
    restoreSelection();
    if (result === 'remove') { if (anchor) { selectNode(anchor); exec('unlink'); } return; }
    if (result !== 'ok') return;
    let url = urlInput.value.trim();
    if (!url) return;
    if (/^[^\s/:]+@[^\s/]+\.[a-z]{2,}$/i.test(url)) url = 'mailto:' + url;
    else if (/^www\./i.test(url)) url = 'https://' + url;
    if (!isSafeUrl(url)) { toast('Dit linkadres is niet toegestaan.', 'error'); return; }
    if (anchor) {
      anchor.setAttribute('href', url);
      changed();
    } else if (selectedText) {
      exec('createLink', url);
    } else {
      const text = textInput.value.trim() || url;
      exec('insertHTML', `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>&nbsp;`);
    }
  }

  function selectNode(node) {
    const r = document.createRange();
    r.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  async function imageDialog() {
    saveSelection();
    const picked = await openMediaPicker(store, { withAlt: true });
    restoreSelection();
    if (!picked) return;
    const alt = escapeHtml(picked.alt || '');
    exec('insertHTML', `<p>${deferMedia(`<img src="${escapeHtml(picked.url)}" alt="${alt}">`, store.mediaUrl)}</p><p><br></p>`);
    hydrateImages();
  }

  /** Foto's uit de repository tonen via een tijdelijk adres (werkt ook bij een privé-repository). */
  async function hydrateImages() {
    if (!store) return;
    for (const img of content.querySelectorAll('img[data-cms-src]')) {
      if ((img.getAttribute('src') || '').startsWith('blob:')) continue;
      store.mediaObjectUrl(img.getAttribute('data-cms-src')).then((u) => { if (u) img.setAttribute('src', u); }).catch(() => {});
    }
  }

  function setHtml(value) {
    content.innerHTML = deferMedia(sanitizeHtml(value), store.mediaUrl) || '<p><br></p>';
    hydrateImages();
  }

  /** Geeft de opgeschoonde HTML terug zoals die in het bestand komt. */
  function getHtml() {
    // <template> is "inert": foto's daarin worden niet door de browser geladen.
    const tpl = document.createElement('template');
    tpl.innerHTML = content.innerHTML;
    for (const img of tpl.content.querySelectorAll('img[data-cms-src]')) {
      img.setAttribute('src', img.getAttribute('data-cms-src'));
      img.removeAttribute('data-cms-src');
    }
    return sanitizeHtml(tpl.innerHTML);
  }

  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* */ }
  setHtml(html);

  const el = h('div', { class: 'editor' }, toolbar, content);
  return { el, getHtml, setHtml, focus: () => content.focus(), contentEl: content };
}
