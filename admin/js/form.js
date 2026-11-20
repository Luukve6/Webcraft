// Bouwt een formulier uit de velden van een collectie (zie lib/schema.js).

import { h, field as fieldWrap, setFieldError, fill, dragHandle, makeSortable } from './ui.js';
import { defaultValue, parseNumber, formatEuro, fillTemplate, uploadTarget, dateWindowText } from './lib/schema.js';

let uid = 0;
const nextId = () => `ff-${++uid}`;

/**
 * @param {object[]} fields
 * @param {object} data  huidige gegevens
 * @param {object} ctx   { store } (voor keuzelijsten uit andere bestanden)
 * @returns {{ el: HTMLElement, getValues: () => object, getUploads: () => object[], clearUploads: () => void, showErrors: (errors: object) => void, onInput: (cb: Function) => void }}
 */
export function buildForm(fields, data, ctx) {
  const registry = []; // { key, wrapper }
  const listeners = [];
  const uploads = new Map(); // veld -> { path, content, name, size, done }
  const changed = () => listeners.forEach((cb) => cb());
  const group = renderFields(fields, data || {}, '', { ...ctx, registry, changed, uploads });
  const el = h('div', { class: 'cms-form', oninput: changed, onchange: changed }, group.el);
  return {
    el,
    getValues: () => group.get(),
    /** Gekozen bestanden die bij de volgende opslag mee moeten (in dezelfde commit). */
    getUploads: () => [...uploads.values()],
    /** Na een geslaagde opslag: de gekozen bestanden staan nu online. */
    clearUploads: () => { const list = [...uploads.values()]; uploads.clear(); list.forEach((u) => u.done()); },
    showErrors(errors) {
      let first = null;
      for (const { key, wrapper } of registry) {
        if (!wrapper.isConnected) continue;
        const msg = errors[key] || '';
        setFieldError(wrapper, msg);
        if (msg && !first) first = wrapper;
      }
      if (first) {
        const det = first.closest('details');
        if (det) det.open = true;
        first.querySelector('input, select, textarea')?.focus();
      }
      return first;
    },
    onInput: (cb) => listeners.push(cb),
  };
}

function renderFields(fields, data, prefix, ctx) {
  const parts = fields.filter((f) => f.widget !== 'hidden').map((f) => [f, renderField(f, data[f.name] ?? defaultValue(f), prefix + f.name, { ...ctx, data })]);
  return {
    el: h('div', { class: 'field-group' }, parts.map(([, p]) => p.el)),
    // extra(): extra waarden naast het veld zelf (bijv. de originele bestandsnaam bij een upload)
    get: () => Object.assign(Object.fromEntries(parts.map(([f, p]) => [f.name, p.get()])), ...parts.map(([, p]) => (p.extra ? p.extra() : {}))),
  };
}

function wrap(f, input, key, ctx, extra = null) {
  const wrapper = fieldWrap({ label: f.label, input, help: f.hint, optional: !f.required, id: input.id });
  if (extra) wrapper.insertBefore(extra, wrapper.querySelector('.field-help, .field-error'));
  ctx.registry.push({ key, wrapper });
  return wrapper;
}

function renderField(f, value, key, ctx) {
  switch (f.widget) {
    case 'text': {
      const input = h('textarea', { id: nextId(), rows: 4 });
      input.value = value ?? '';
      return { el: wrap(f, input, key, ctx), get: () => input.value.trim() };
    }
    case 'number': {
      const input = h('input', { id: nextId(), type: 'text', inputmode: 'decimal', class: 'input-small', autocomplete: 'off' });
      input.value = value === null || value === undefined || value === '' ? '' : (f.euro ? formatEuro(value) : String(value).replace('.', ','));
      const wrapper = wrap(f, input, key, ctx);
      if (f.euro) {
        const row = h('div', { class: 'input-with-prefix' });
        wrapper.replaceChild(row, input);
        row.append(h('span', { class: 'input-prefix', 'aria-hidden': 'true' }, '€'), input);
      }
      return { el: wrapper, get: () => parseNumber(input.value, { integer: f.integer }) };
    }
    case 'boolean': {
      const input = h('input', { id: nextId(), type: 'checkbox' });
      input.checked = Boolean(value);
      const wrapper = h('div', { class: 'field' }, h('label', { class: 'check' }, input, ' ', f.label), f.hint ? h('p', { class: 'field-help' }, f.hint) : null, h('p', { class: 'field-error', hidden: true }));
      ctx.registry.push({ key, wrapper });
      return { el: wrapper, get: () => input.checked };
    }
    case 'date': {
      const input = h('input', { id: nextId(), type: 'date', class: 'input-date' });
      input.value = value || '';
      const wrapper = wrap(f, input, key, ctx);
      const row = h('div', { class: 'inline-row' });
      wrapper.replaceChild(row, input);
      row.append(input);
      if (!f.required) row.append(h('button', { type: 'button', class: 'btn btn-small', onclick: () => { input.value = ''; ctx.changed(); } }, 'Leegmaken'));
      return { el: wrapper, get: () => input.value };
    }
    case 'select':
    case 'relation': {
      const options = f.widget === 'relation' ? relationOptions(f, ctx) : (f.options || []).map((o) => (typeof o === 'object' ? o : { label: String(o), value: o }));
      if (f.multiple) {
        const set = new Set(Array.isArray(value) ? value : []);
        const boxes = options.map((o) => { const cb = h('input', { type: 'checkbox', value: o.value }); cb.checked = set.has(o.value); return [o, cb]; });
        const wrapper = h('fieldset', { class: 'field fieldset-plain' },
          h('legend', {}, f.label, f.required ? null : h('span', { class: 'optional' }, ' (optioneel)')),
          h('div', { class: 'check-row' }, boxes.map(([o, cb]) => h('label', { class: 'check' }, cb, ' ', o.label))),
          f.hint ? h('p', { class: 'field-help' }, f.hint) : null,
          h('p', { class: 'field-error', hidden: true }));
        ctx.registry.push({ key, wrapper });
        return { el: wrapper, get: () => boxes.filter(([, cb]) => cb.checked).map(([o]) => o.value) };
      }
      const select = h('select', { id: nextId() },
        h('option', { value: '' }, f.required ? '— Kies —' : '— Geen —'),
        options.map((o) => h('option', { value: String(o.value) }, o.label)));
      if (value !== '' && value !== null && value !== undefined && !options.some((o) => String(o.value) === String(value))) {
        select.append(h('option', { value: String(value) }, `${value} (bestaat niet meer)`));
      }
      select.value = value === null || value === undefined ? '' : String(value);
      return { el: wrap(f, select, key, ctx), get: () => select.value };
    }
    case 'object': {
      const inner = renderFields(f.fields, value || {}, key + '.', ctx);
      const note = f.dateWindow ? h('p', { class: 'field-note', role: 'status' }) : null;
      const el = h('fieldset', { class: 'fieldset' }, h('legend', {}, f.label), f.hint ? h('p', { class: 'field-help' }, f.hint) : null, inner.el, note);
      if (note) {
        // Zegt meteen wat bezoekers zien: wel/geen melding, of vanaf wanneer.
        const update = () => { note.textContent = dateWindowText(f.dateWindow, inner.get()); };
        el.addEventListener('input', update); el.addEventListener('change', update);
        el.addEventListener('click', () => setTimeout(update, 0)); // knop "Leegmaken"
        update();
      }
      return { el, get: inner.get };
    }
    case 'list':
      return f.fields ? renderObjectList(f, value, key, ctx) : renderSimpleList(f, value, key, ctx);
    case 'file':
      return renderFile(f, value, key, ctx);
    default: {
      const input = h('input', { id: nextId(), type: 'text', autocomplete: 'off' });
      input.value = value ?? '';
      return { el: wrap(f, input, key, ctx), get: () => input.value.trim() };
    }
  }
}

const MB = 1024 * 1024;
const sizeText = (n) => (n >= MB ? `${(n / MB).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);

/**
 * Bestand uploaden (bijv. een PDF). De waarde in het JSON-bestand is het adres op de website
 * (bijv. assets/docs/afhaallijst.pdf); het bestand zelf gaat bij "Opslaan" mee in dezelfde commit.
 */
function renderFile(f, value, key, ctx) {
  let saved = value || '';
  let current = saved;
  // f.nameField: daarin staat de originele naam van het geüploade bestand (op de website heet het f.fileName)
  let savedName = f.nameField && ctx.data ? String(ctx.data[f.nameField] || '') : '';
  let currentName = savedName;
  const input = h('input', { id: nextId(), type: 'file', accept: f.accept || '' });
  const status = h('p', { class: 'file-status' });
  const base = typeof ctx.siteUrl === 'function' ? ctx.siteUrl() : '';
  const showCurrent = () => fill(status, current
    ? [h('span', {}, 'Nu op de website: '), h('a', { href: base ? `${base}/${current.replace(/^\//, '')}` : current, target: '_blank', rel: 'noopener' }, currentName || current.split('/').pop()), h('span', { class: 'muted' }, ' (openen)')]
    : h('span', { class: 'muted' }, 'Nog geen bestand.'));
  const cancel = h('button', { type: 'button', class: 'btn btn-small', style: 'display:none', onclick: () => { reset(); ctx.changed(); } }, 'Toch niet');
  function reset() {
    ctx.uploads.delete(key);
    current = saved;
    currentName = savedName;
    input.value = '';
    cancel.style.display = 'none';
    showCurrent();
  }
  const wrapper = wrap(f, input, key, ctx, status);
  const row = h('div', { class: 'inline-row' });
  wrapper.replaceChild(row, input);
  row.append(input, cancel);
  showCurrent();

  input.addEventListener('change', async (ev) => {
    ev.stopPropagation();
    const file = input.files && input.files[0];
    if (!file) { reset(); ctx.changed(); return; }
    const error = (msg) => { reset(); setFieldError(wrapper, msg); ctx.changed(); };
    const maxMb = f.maxSizeMB || 20;
    if (file.size > maxMb * MB) return error(`Dit bestand is te groot (${sizeText(file.size)}). Maximaal ${maxMb} MB.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const wantsPdf = /\.pdf\b/i.test(f.accept || '');
    if (wantsPdf && !(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
      return error('Dit bestand is geen echte PDF (ook al eindigt de naam misschien op .pdf). Sla het eerst op als PDF, bijvoorbeeld via "Afdrukken → Opslaan als PDF".');
    }
    const target = uploadTarget(f, file.name);
    setFieldError(wrapper, '');
    ctx.uploads.set(key, {
      path: target.path, content: bytes, name: file.name, size: file.size,
      done: () => { saved = target.value; savedName = file.name; reset(); },
    });
    current = target.value;
    currentName = file.name;
    cancel.style.display = '';
    fill(status, h('strong', {}, `Nieuw gekozen: ${file.name} (${sizeText(file.size)}).`), ' Klik op "Opslaan en online zetten" om het oude bestand te vervangen.');
    ctx.changed();
  });
  return { el: wrapper, get: () => current, extra: () => (f.nameField && currentName ? { [f.nameField]: currentName } : {}) };
}

function relationOptions(f, ctx) {
  const data = ctx.store?.dataAt(f.file);
  const list = data ? (f.list ? data[f.list] : data) : [];
  return (Array.isArray(list) ? list : []).map((o) => ({ value: o[f.valueField || 'id'], label: o[f.labelField || 'title'] ?? o[f.valueField || 'id'] }));
}

/** Na een sleepbeweging: rijen in de nieuwe volgorde zetten en opnieuw tekenen. */
function reorderRows(rows, from, to, rerender, keyboard, listEl) {
  const [row] = rows.splice(from, 1);
  rows.splice(to, 0, row);
  rerender();
  if (keyboard) listEl.children[to]?.querySelector('.drag-handle')?.focus();
}

/** Lijst met losse tekstregels (bijv. gerechten van het maandmenu). */
function renderSimpleList(f, value, key, ctx) {
  const single = f.labelSingular || 'regel';
  const rows = (Array.isArray(value) ? value : []).map((v) => ({ value: v }));
  const listEl = h('ol', { class: 'simple-list' });
  const inner = f.field;

  function rerender(focusIndex = null) {
    fill(listEl, ...rows.map((row, i) => {
      const input = inner.widget === 'date' ? h('input', { type: 'date', class: 'input-date' }) : h('input', { type: 'text', autocomplete: 'off' });
      input.value = row.value ?? '';
      input.setAttribute('aria-label', `${cap(single)} ${i + 1}`);
      input.addEventListener('input', () => { row.value = input.value; });
      row.input = input;
      const li = h('li', { class: 'simple-row' }, dragHandle(`${cap(single)} ${i + 1}`), input,
        h('button', { type: 'button', class: 'btn btn-small btn-icon btn-danger-outline', title: 'Verwijderen', 'aria-label': `${cap(single)} ${i + 1} verwijderen`, onclick: () => { rows.splice(i, 1); rerender(Math.min(i, rows.length - 1)); ctx.changed(); } }, '✕'),
        h('p', { class: 'field-error', hidden: true }));
      ctx.registry.push({ key: `${key}.${i}`, wrapper: li });
      return li;
    }));
    if (focusIndex !== null && rows[focusIndex]) rows[focusIndex].input.focus();
    ctx.changed();
  }
  rerender();
  makeSortable(listEl, { items: 'li', onReorder: (from, to, o) => reorderRows(rows, from, to, rerender, o.keyboard, listEl) });

  const addBtn = h('button', { type: 'button', class: 'btn btn-small', onclick: () => { rows.push({ value: '' }); rerender(rows.length - 1); } }, `+ ${cap(single)} toevoegen`);
  const wrapper = h('fieldset', { class: 'field fieldset-plain' },
    h('legend', {}, f.label, f.required ? null : h('span', { class: 'optional' }, ' (optioneel)')),
    f.hint ? h('p', { class: 'field-help' }, f.hint) : null,
    listEl, f.allowAdd ? addBtn : null,
    h('p', { class: 'field-error', hidden: true }));
  ctx.registry.push({ key, wrapper });
  return { el: wrapper, get: () => rows.map((r) => (inner.widget === 'date' ? r.value : String(r.value ?? '').trim())).filter((v) => v !== '') };
}

/** Lijst met blokken die elk meerdere velden hebben (bijv. openingstijden per dag). */
function renderObjectList(f, value, key, ctx) {
  const single = f.labelSingular || 'onderdeel';
  const rows = (Array.isArray(value) ? value : []).map((v, i) => ({ data: v || {}, orig: i, open: false }));
  const listEl = h('div', { class: 'object-list' });

  function rerender(focusIndex = null) {
    // huidige invoer bewaren voordat we opnieuw tekenen
    for (const r of rows) if (r.part) r.data = { ...r.data, ...r.part.get() };
    fill(listEl, ...rows.map((row, i) => {
      const part = renderFields(f.fields, row.data, `${key}.${i}.`, ctx);
      row.part = part;
      linkSlugFields(f.fields, `${key}.${i}.`, ctx, row);
      const summaryText = h('span', { class: 'object-summary' });
      const updateSummary = () => {
        const d = { ...row.data, ...part.get() };
        // "summaryWhen": andere samenvatting als een vinkje aan staat (bijv. "Maandag: gesloten")
        const alt = (f.summaryWhen || []).find((w) => d[w.field]);
        const tpl = alt ? alt.summary : f.summary;
        const s = tpl ? fillTemplate(tpl, d, (v) => (v === true ? 'ja' : v === false || v == null ? '' : String(v))) : '';
        summaryText.textContent = s.replace(/\s+[–-]\s*$/, '').trim() || `${cap(single)} ${i + 1}`;
      };
      updateSummary();
      const det = h('details', { class: 'object-item', open: row.open, ontoggle: () => { row.open = det.open; }, oninput: updateSummary, onchange: updateSummary },
        h('summary', {}, dragHandle(summaryText.textContent || `${cap(single)} ${i + 1}`), summaryText),
        h('div', { class: 'object-body' }, part.el,
          f.allowAdd ? h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn btn-small btn-danger-outline', onclick: () => { rows.splice(i, 1); rerender(); ctx.changed(); } }, `${cap(single)} verwijderen`)) : null));
      return det;
    }));
    if (focusIndex !== null && listEl.children[focusIndex]) {
      const det = listEl.children[focusIndex];
      det.open = true; rows[focusIndex].open = true;
      det.querySelector('input, select, textarea')?.focus();
    }
    ctx.changed();
  }
  rerender();
  makeSortable(listEl, { items: 'details', onReorder: (from, to, o) => reorderRows(rows, from, to, rerender, o.keyboard, listEl) });

  const addBtn = h('button', { type: 'button', class: 'btn btn-small', onclick: () => {
    rows.push({ data: Object.fromEntries(f.fields.map((x) => [x.name, defaultValue(x)])), orig: undefined, open: true });
    rerender(rows.length - 1);
  } }, `+ ${cap(single)} toevoegen`);

  const wrapper = h('fieldset', { class: 'field fieldset' },
    h('legend', {}, f.label, f.required ? null : h('span', { class: 'optional' }, ' (optioneel)')),
    f.hint ? h('p', { class: 'field-help' }, f.hint) : null,
    listEl, f.allowAdd ? addBtn : null,
    h('p', { class: 'field-error', hidden: true }));
  ctx.registry.push({ key, wrapper });
  return { el: wrapper, get: () => rows.map((r) => ({ ...r.part.get(), __orig: r.orig })) };
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// laatste registratie = de net getekende versie (na opnieuw tekenen staan oude erboven)
const inputOf = (ctx, key) => ctx.registry.findLast((r) => r.key === key)?.wrapper.querySelector('input, select, textarea');

/**
 * Velden met "slugFrom" (bijv. de korte code van een categorie): bij een NIEUW blok vult de code zich
 * vanzelf uit de titel, zolang je hem niet zelf aanpast. Bij een bestaand blok met "lockExisting"
 * kan de code niet meer veranderen (dan blijven gekoppelde gegevens kloppen).
 */
function linkSlugFields(fields, prefix, ctx, row) {
  for (const f of fields) {
    if (!f.slugFrom) continue;
    const target = inputOf(ctx, prefix + f.name);
    const source = inputOf(ctx, prefix + f.slugFrom);
    if (!target || !source) continue;
    if (row.orig !== undefined) {
      if (f.lockExisting && target.value) {
        target.readOnly = true;
        target.title = 'Deze code is gekoppeld aan andere gegevens en kan niet meer veranderen.';
      }
      continue;
    }
    let auto = !target.value || target.value === slugify(source.value);
    target.addEventListener('input', () => { auto = !target.value; });
    source.addEventListener('input', () => { if (auto) target.value = slugify(source.value); });
  }
}

function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' en ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
