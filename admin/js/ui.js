// Kleine hulpfuncties voor de interface: elementen maken, meldingen, dialogen.
// Er wordt bewust geen innerHTML gebruikt met gebruikersinvoer.

/** De website van Webcraft zelf (Nederlandse versie), voor de link in de zijbalk en bij Hulp. */
export const WEBCRAFT_URL = 'https://webcraft-cus.pages.dev/nl/';

/** Maakt een DOM-element: h('button', {class: 'btn', onclick}, 'Tekst') */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = Boolean(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Vervangt de inhoud van een element (null/false worden overgeslagen). */
export function fill(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// Eenvoudige iconen (inline SVG, geen externe bestanden nodig)
const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  page: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z',
  post: 'M20 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zm-1 16H5V5h14v14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z',
  image: 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z',
  settings: 'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5-2.2-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  help: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 17h-2v-2h2v2zm2.1-7.7-.9.9c-.7.7-1.2 1.3-1.2 2.8h-2v-.5c0-1.1.5-2.1 1.2-2.8l1.2-1.3a2 2 0 1 0-3.4-1.4H8a4 4 0 1 1 7.1 2.3z',
  external: 'M14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7zm5 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z',
  menu: 'M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z',
  logout: 'M16 17v-3H9v-4h7V7l5 5-5 5zM14 2a2 2 0 0 1 2 2v2h-2V4H5v16h9v-2h2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9z',
  back: 'M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  users: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z',
  food: 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z',
  calendar: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z',
  list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  star: 'M12 17.3l6.2 3.7-1.6-7 5.4-4.7-7.2-.6L12 2 9.2 8.7 2 9.3l5.4 4.7-1.6 7z',
  truck: 'M20 8h-3V4H3a2 2 0 0 0-2 2v11h2a3 3 0 0 0 6 0h6a3 3 0 0 0 6 0h2v-5l-3-4zM6 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm13.5-9 2 2.5H17V9.5h2.5zM18 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
  download: 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z',
  grip: 'M9 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 6.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 6.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9-13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 6.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 6.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z',
  sun: 'M6.8 4.8 5 3 3.6 4.4l1.8 1.8 1.4-1.4zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7 1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91 1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z',
  arrowUp: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
  arrowDown: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
  pencil: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  trash: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
};

// ---------- Actieknoppen (bewerken / verwijderen) ----------

/** Grijs knopje met potloodje: "Bewerken" (een link). */
export function editAction(href, label = 'Bewerken', title) {
  return h('a', { class: 'act act-edit', href, title }, icon('pencil', 16), h('span', {}, label));
}

/** Grijs knopje met oogje: "Bekijken" op de website (nieuw tabblad). */
export function viewAction(href, label = 'Bekijken') {
  return h('a', { class: 'act act-view', href, target: '_blank', rel: 'noopener' }, icon('eye', 16), h('span', {}, label));
}

/** Rood knopje met prullenbakje: "Verwijderen". */
export function deleteAction(onclick, label = 'Verwijderen', { ariaLabel, iconOnly = false } = {}) {
  return h('button', { type: 'button', class: `act act-delete${iconOnly ? ' act-icon' : ''}`, onclick, 'aria-label': ariaLabel || label, title: iconOnly ? label : undefined },
    icon('trash', 16), iconOnly ? null : h('span', {}, label));
}

export function icon(name, size = 20) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name] || '');
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

// ---------- Slepen om de volgorde te veranderen ----------

/** Sleepgreep (6 puntjes) links in een blok. */
export function dragHandle(label) {
  return h('button', {
    type: 'button', class: 'drag-handle', 'aria-label': `${label} verplaatsen`,
    title: 'Sleep om te verplaatsen (of gebruik de pijltjestoetsen)',
  }, icon('grip', 18));
}

/**
 * Maakt de blokken in `container` versleepbaar aan hun .drag-handle.
 * Werkt met muis, vinger (telefoon/tablet) en toetsenbord (pijltje omhoog/omlaag op de greep).
 * Tijdens het slepen schuift het blok live tussen de andere; bij loslaten volgt onReorder(van, naar).
 * @param {HTMLElement} container
 * @param {{ items: string, onReorder: (from: number, to: number, opts: { keyboard: boolean }) => void, enabled?: () => boolean }} opts
 *   items: CSS-selector voor de blokken (directe kinderen van container)
 */
export function makeSortable(container, { items, onReorder, enabled = () => true }) {
  const list = () => [...container.children].filter((el) => el.matches(items));
  const itemOf = (el) => list().find((it) => it.contains(el));

  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle || !container.contains(handle) || e.button > 0 || !enabled()) return;
    const item = itemOf(handle);
    if (!item) return;
    e.preventDefault();
    const start = list().indexOf(item);
    item.classList.add('is-dragging');
    container.classList.add('is-sorting');
    // Luisteren op het hele venster: het blok (en de greep) verhuist tijdens het slepen in de pagina,
    // waardoor de greep de muis/vinger anders 'kwijtraakt'.
    const pid = e.pointerId;
    let scroller = null; let lastY = e.clientY;

    const place = (y) => {
      const others = list().filter((el) => el !== item);
      const before = others.find((el) => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; });
      if (before) { if (item.nextElementSibling !== before) before.before(item); }
      else if (others.length) { const last = others[others.length - 1]; if (last.nextElementSibling !== item) last.after(item); }
    };
    // Aan de rand van het scherm vanzelf mee scrollen
    const autoScroll = () => {
      const edge = 70;
      const dy = lastY < edge ? -14 : lastY > window.innerHeight - edge ? 14 : 0;
      if (dy) { window.scrollBy(0, dy); place(lastY); }
      scroller = requestAnimationFrame(autoScroll);
    };
    scroller = requestAnimationFrame(autoScroll);

    const move = (ev) => { if (ev.pointerId !== pid) return; ev.preventDefault(); lastY = ev.clientY; place(ev.clientY); };
    const end = (ev) => {
      if (ev && ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      cancelAnimationFrame(scroller);
      item.classList.remove('is-dragging');
      container.classList.remove('is-sorting');
      const to = list().indexOf(item);
      if (to !== start) onReorder(start, to, { keyboard: false });
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  });

  // Klik op de greep doet niets (bijv. geen inklappen van een blok)
  container.addEventListener('click', (e) => { if (e.target.closest('.drag-handle')) { e.preventDefault(); e.stopPropagation(); } }, true);

  container.addEventListener('keydown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle || !container.contains(handle) || !enabled()) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const all = list();
    const from = all.indexOf(itemOf(handle));
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (from < 0 || to < 0 || to >= all.length) return;
    onReorder(from, to, { keyboard: true });
  });
}

/**
 * Uitgesteld opslaan: na een wijziging wachten tot er `delay` ms niets meer verandert, en dan alles in
 * één keer opslaan. Ondertussen kan de gebruiker gewoon doorgaan (bijv. meer rijen slepen).
 * @param {{ delay?: number, save: () => Promise<void>, onState?: (state: 'pending'|'saving'|'saved'|'error', err?: Error) => void }} opts
 */
export function createDelayedSaver({ delay = 3000, save, onState = () => {} }) {
  let timer = null; let running = false; let again = false;
  async function run() {
    timer = null;
    if (running) { again = true; return; }
    running = true; onState('saving');
    try { await save(); onState('saved'); } catch (e) { onState('error', e); } finally {
      running = false;
      if (again) { again = false; schedule(); }
    }
  }
  function schedule() { clearTimeout(timer); onState('pending'); timer = setTimeout(run, delay); }
  return {
    schedule,
    /** Nu meteen opslaan als er nog iets wacht (bijv. bij weggaan van de pagina). */
    flush() { if (timer) { clearTimeout(timer); run(); } },
    get busy() { return Boolean(timer) || running; },
  };
}

/**
 * Pijltjes omhoog/omlaag naast een sleepgreep (voor wie liever klikt dan sleept).
 * @param {number} index  plek in de lijst
 * @param {number} count  aantal in de lijst
 * @param {(dir: -1|1) => void} onMove
 * @param {string} label  bijv. '"Kroepoek"'
 */
export function moveArrows(index, count, onMove, label) {
  const btn = (dir) => h('button', {
    type: 'button', class: `move-btn ${dir < 0 ? 'move-up' : 'move-down'}`, title: dir < 0 ? 'Omhoog' : 'Omlaag',
    'aria-label': `${label} ${dir < 0 ? 'omhoog' : 'omlaag'}`, disabled: dir < 0 ? index === 0 : index === count - 1,
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); onMove(dir); },
  }, icon(dir < 0 ? 'arrowUp' : 'arrowDown', 18));
  return h('span', { class: 'move-arrows' }, btn(-1), btn(1));
}

/** Verplaatst een element in een array (geeft een nieuwe array). */
export function moveInArray(arr, from, to) {
  const out = [...arr];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

// ---------- Meldingen (rechtsonder) ----------

export function toast(message, type = 'info', timeout = 5000) {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite', role: 'status' });
    document.body.append(host);
  }
  const el = h('div', { class: `toast toast-${type}` }, message);
  const close = h('button', { class: 'toast-close', 'aria-label': 'Melding sluiten', onclick: () => el.remove() }, '×');
  el.append(close);
  host.append(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

// ---------- Dialogen ----------

/**
 * Toont een dialoogvenster. buttons: [{label, value, class}]
 * Geeft een Promise met de waarde van de gekozen knop (of null bij sluiten).
 */
const openModals = new Set();

/** Sluit alle open dialoogvensters (als "geannuleerd"), bijv. als je naar een ander scherm gaat. */
export function closeModals() {
  for (const done of [...openModals]) done(null);
}

export function modal({ title, body, buttons = [{ label: 'Sluiten', value: null }], wide = false, onOpen }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const overlay = h('div', { class: 'modal-overlay' });
    const titleId = 'modal-title-' + Math.random().toString(36).slice(2);
    const box = h('div', { class: `modal${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
    const done = (value) => {
      if (!openModals.delete(done)) return; // al gesloten
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(null); });

    const footer = h('div', { class: 'modal-footer' },
      buttons.map((b) => h('button', { type: 'button', class: `btn ${b.class || ''}`, onclick: () => done(typeof b.value === 'function' ? b.value() : b.value) }, b.label)));
    box.append(
      h('div', { class: 'modal-header' },
        h('h2', { id: titleId }, title),
        h('button', { class: 'modal-close', type: 'button', 'aria-label': 'Sluiten', onclick: () => done(null) }, '×')),
      h('div', { class: 'modal-body' }, body),
      footer,
    );
    overlay.append(box);
    document.body.append(overlay);
    openModals.add(done);
    if (onOpen) onOpen({ close: done, box });
    const first = box.querySelector('input, select, textarea, .modal-body button') || footer.querySelector('.btn-primary') || footer.querySelector('button');
    if (first) first.focus();
  });
}

export async function confirmDialog(title, message, okLabel = 'Ja', { danger = false, cancelLabel = 'Annuleren' } = {}) {
  const result = await modal({
    title,
    body: h('p', {}, message),
    buttons: [
      { label: cancelLabel, value: false },
      { label: okLabel, value: true, class: danger ? 'btn-danger' : 'btn-primary' },
    ],
  });
  return result === true;
}

// ---------- Opmaak ----------

export function timeAgo(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'zojuist';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min geleden`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs} uur geleden`;
  const days = Math.round(hrs / 24);
  if (days < 7) return days === 1 ? 'gisteren' : `${days} dagen geleden`;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function statusBadge(status) {
  return status === 'published'
    ? h('span', { class: 'badge badge-online' }, 'Staat online')
    : h('span', { class: 'badge badge-draft' }, 'Concept');
}

/** Formulierveld met label, hulptekst en foutmelding. */
export function field({ label, input, help, error, optional = false, id }) {
  const fid = id || input.id || 'f-' + Math.random().toString(36).slice(2);
  input.id = fid;
  const errEl = h('p', { class: 'field-error', id: fid + '-err', hidden: !error }, error || '');
  if (help) input.setAttribute('aria-describedby', fid + '-help');
  return h('div', { class: 'field' },
    h('label', { for: fid }, label, optional ? h('span', { class: 'optional' }, ' (optioneel)') : null),
    input,
    help ? h('p', { class: 'field-help', id: fid + '-help' }, help) : null,
    errEl,
  );
}

export function setFieldError(wrapper, message) {
  // Eigen melding van dit veld eerst (bij een lijst zitten de meldingen van de regels er dieper in)
  const err = wrapper.querySelector(':scope > .field-error') || wrapper.querySelector('.field-error');
  const input = wrapper.querySelector('input, textarea, select');
  if (!err) return;
  err.textContent = message || '';
  err.hidden = !message;
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
}
