// Overzicht en formulier voor collecties (eigen soorten inhoud uit config.json).

import { h, fill, icon, toast, confirmDialog, modal } from '../ui.js';
import { ConflictError } from '../lib/github.js';
import { buildForm } from '../form.js';
import { validateData, mergeData, entryId, entryTitle, sortEntries, formatEuro, defaultData, referenceErrors } from '../lib/schema.js';

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);


function columnText(col, data) {
  const v = data?.[col.field];
  if (col.format === 'euro') return v === null || v === undefined || v === '' ? (col.empty || '') : `€ ${formatEuro(v)}`;
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'ja' : '';
  return v === null || v === undefined ? '' : String(v);
}

/** Opties om op te groeperen (bijv. categorieën van de menukaart), in volgorde. */
function groupOptions(ctx, collection) {
  const g = collection.groupBy;
  if (!g) return null;
  const f = collection.fields.find((x) => x.name === g.field);
  if (!f) return null;
  if (f.widget === 'relation') {
    const data = ctx.store.dataAt(f.file);
    const list = data ? (f.list ? data[f.list] : data) : [];
    return (Array.isArray(list) ? list : []).map((o) => ({ value: String(o[f.valueField || 'id']), label: String(o[f.labelField || 'title'] ?? o[f.valueField || 'id']) }));
  }
  return (f.options || []).map((o) => (typeof o === 'object' ? { value: String(o.value), label: o.label } : { value: String(o), label: String(o) }));
}

export function collectionListView(ctx, name) {
  const { store } = ctx;
  const col = store.collection(name);
  if (col.kind === 'file') return collectionEditView(ctx, name, name);

  let group = '';
  let query = '';
  const groups = groupOptions(ctx, col);
  const columns = col.columns || [{ field: col.titleField || col.fields[0].name, label: 'Naam' }];
  const titleField = col.titleField || col.fields[0].name;
  const tbody = h('tbody');
  const countEl = h('p', { class: 'muted small' });

  const groupSelect = groups
    ? h('select', { class: 'group-select', 'aria-label': col.groupBy.label || 'Groep', onchange: () => { group = groupSelect.value; render(); } },
      h('option', { value: '' }, `Alle ${col.groupBy.labelPlural || 'groepen'}`),
      groups.map((o) => h('option', { value: o.value }, o.label)))
    : null;
  const search = h('input', { type: 'search', class: 'search', placeholder: `Zoek in ${col.label.toLowerCase()}…`, 'aria-label': `Zoek in ${col.label}`, oninput: () => { query = search.value.trim().toLowerCase(); render(); } });

  async function remove(entry) {
    const title = entryTitle(col, entry.data, entry.id);
    const ok = await confirmDialog(`${cap(col.labelSingular)} verwijderen`, `Weet je zeker dat je "${title}" wilt verwijderen? Het verdwijnt dan ook van de website.`, 'Verwijderen', { danger: true });
    if (!ok) return;
    ctx.setSaving(true);
    try {
      await store.deleteEntry(name, entry.id);
      toast(`"${title}" is verwijderd.`, 'success');
      render();
    } catch (e) {
      toast('Verwijderen mislukt: ' + e.message, 'error', 10000);
    } finally {
      ctx.setSaving(false);
    }
  }

  function row(entry) {
    const href = `#/c/${name}/edit/${encodeURIComponent(entry.id)}`;
    return h('tr', {},
      ...columns.map((c, i) => (i === 0 || c.field === titleField
        ? h('td', { class: 'col-title', 'data-label': c.label },
          h('a', { href, class: 'row-title' }, columnText(c, entry.data) || '(zonder naam)'),
          i === 0 ? h('div', { class: 'row-actions' },
            h('a', { href }, 'Bewerken'),
            col.allowDelete ? h('button', { type: 'button', class: 'link-danger', onclick: () => remove(entry) }, 'Verwijderen') : null) : null)
        : h('td', { 'data-label': c.label, class: c.format === 'euro' ? 'num' : 'muted' }, columnText(c, entry.data)))));
  }

  function render() {
    let entries = sortEntries(col, store.listEntries(name));
    const total = entries.length;
    if (group) entries = entries.filter((e) => String(e.data?.[col.groupBy.field] ?? '') === group);
    if (query) entries = entries.filter((e) => columns.some((c) => columnText(c, e.data).toLowerCase().includes(query)) || JSON.stringify(e.data).toLowerCase().includes(query));
    countEl.textContent = entries.length === total ? `${total} ${total === 1 ? col.labelSingular : col.labelPlural || col.label.toLowerCase()}` : `${entries.length} van de ${total}`;
    const rows = [];
    if (!entries.length) {
      rows.push(h('tr', {}, h('td', { colspan: columns.length, class: 'empty' }, total ? 'Niets gevonden.' : `Er is nog niets. Klik op "Nieuw toevoegen".`)));
    } else if (groups && !group) {
      const known = new Set(groups.map((g) => g.value));
      for (const g of [...groups, { value: null, label: 'Zonder (bestaande) ' + (col.groupBy.label || 'groep').toLowerCase() }]) {
        const inGroup = entries.filter((e) => (g.value === null ? !known.has(String(e.data?.[col.groupBy.field] ?? '')) : String(e.data?.[col.groupBy.field] ?? '') === g.value));
        if (!inGroup.length) continue;
        rows.push(h('tr', { class: 'group-row' }, h('th', { colspan: columns.length, scope: 'colgroup' }, `${g.label} (${inGroup.length})`)));
        rows.push(...inGroup.map(row));
      }
    } else {
      rows.push(...entries.map(row));
    }
    fill(tbody, ...rows);
  }
  render();

  const el = h('div', { class: 'view' },
    h('div', { class: 'view-header' },
      h('h1', {}, col.label),
      col.allowCreate ? h('a', { class: 'btn btn-primary', href: `#/c/${name}/new` }, icon('plus', 18), 'Nieuw toevoegen') : null),
    col.description ? h('p', { class: 'lead' }, col.description) : null,
    h('div', { class: 'list-tools' }, h('div', { class: 'inline-row' }, groupSelect, countEl), search),
    h('div', { class: 'card card-flush' },
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, columns.map((c) => h('th', { scope: 'col', class: c.format === 'euro' ? 'num' : null }, c.label)))),
        tbody)));
  return { el };
}

/**
 * Formulier voor één item (map-collectie) of voor een vast bestand.
 * @param {string|null} id  null = nieuw item
 */
export function collectionEditView(ctx, name, id) {
  const { store } = ctx;
  const col = store.collection(name);
  const isFile = col.kind === 'file';
  let entry = id ? store.getEntry(name, id) : null;

  if (id && !entry && !isFile) {
    return { el: h('div', { class: 'view' }, backLink(col), h('h1', {}, 'Niet gevonden'), h('p', {}, `Dit ${col.labelSingular} bestaat niet (meer).`)) };
  }

  const startData = entry ? entry.data : { ...defaultData(col.fields), ...(col.defaults || {}) };
  const form = buildForm(col.fields, startData, ctx);
  const stateKey = () => JSON.stringify([form.getValues(), form.getUploads().map((u) => [u.path, u.name, u.size])]);
  let snapshot = stateKey();
  let dirty = false;
  let saving = false;

  const statusLine = h('p', { class: 'publish-status' });
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block btn-large', onclick: () => save() }, 'Opslaan en online zetten');
  const viewLink = col.previewUrl && ctx.siteUrl()
    ? h('a', { class: 'btn btn-block', href: ctx.siteUrl() + col.previewUrl, target: '_blank', rel: 'noopener' }, icon('external', 16), 'Bekijk op de website')
    : null;
  const deleteBtn = !isFile && entry && col.allowDelete
    ? h('button', { type: 'button', class: 'btn btn-danger-outline btn-block', onclick: () => remove() }, `${cap(col.labelSingular)} verwijderen`)
    : null;

  function updateStatus() {
    saveBtn.disabled = saving;
    saveBtn.textContent = saving ? 'Bezig met opslaan…' : 'Opslaan en online zetten';
    fill(statusLine, dirty
      ? h('span', { class: 'badge badge-unsaved' }, 'Niet opgeslagen wijzigingen')
      : h('span', { class: 'badge badge-online' }, entry ? 'Alles opgeslagen' : 'Nog niet opgeslagen'));
  }
  form.onInput(() => {
    const now = stateKey();
    const d = now !== snapshot;
    if (d !== dirty) { dirty = d; updateStatus(); }
  });

  async function save() {
    if (saving) return;
    const values = form.getValues();
    const errors = validateData(col.fields, values);
    let newId = null;
    if (!isFile && !entry) {
      newId = entryId(col, values);
      if (store.getEntry(name, newId)) {
        const key = (col.idFields || [col.titleField || col.fields[0].name])[0];
        errors[key] = `Er bestaat al een ${col.labelSingular} "${newId}". Kies een ander${col.idFields ? ' nummer of een andere naam' : 'e naam'}.`;
      }
    }
    Object.assign(errors, referenceErrors(col, values, store, entry ? entry.data : {}));
    form.showErrors(errors);
    if (Object.keys(errors).length) { toast('Controleer de rood gemarkeerde velden.', 'error'); return; }

    const data = mergeData(col.fields, entry ? entry.data : {}, values);
    if (!entry) for (const [k, v] of Object.entries(col.defaults || {})) if (!(k in data)) data[k] = v;
    saving = true; updateStatus(); ctx.setSaving(true);
    try {
      entry = await store.saveEntry(name, entry ? entry.id : null, data, newId, form.getUploads());
      form.clearUploads();
      snapshot = stateKey();
      dirty = false;
      if (!isFile) heading.textContent = entryTitle(col, entry.data, entry.id); // nieuwe naam meteen bovenaan
      toast(isFile ? `${col.label} opgeslagen. De website wordt bijgewerkt.` : `"${entryTitle(col, entry.data, entry.id)}" is opgeslagen. De website wordt bijgewerkt.`, 'success');
      if (!isFile && !id) { ctx.navigate(`#/c/${name}/edit/${encodeURIComponent(entry.id)}`, { replace: true, force: true }); return; }
    } catch (e) {
      if (e instanceof ConflictError) {
        await modal({
          title: 'Iemand anders was je voor',
          body: h('div', {},
            h('p', {}, 'Dit is intussen door iemand anders (of in een ander tabblad) gewijzigd, of de naam is al in gebruik.'),
            h('p', {}, 'Je wijzigingen zijn nog niet opgeslagen. Klik op "Vernieuwen" in de bovenbalk om de nieuwste versie te laden en doe je wijziging daarna opnieuw.')),
          buttons: [{ label: 'Begrepen', value: null, class: 'btn-primary' }],
        });
      } else {
        toast('Opslaan mislukt: ' + e.message, 'error', 12000);
      }
    } finally {
      saving = false; ctx.setSaving(false); updateStatus();
    }
  }

  async function remove() {
    const title = entryTitle(col, entry.data, entry.id);
    const ok = await confirmDialog(`${cap(col.labelSingular)} verwijderen`, `Weet je zeker dat je "${title}" wilt verwijderen? Het verdwijnt dan ook van de website.`, 'Verwijderen', { danger: true });
    if (!ok) return;
    ctx.setSaving(true);
    try {
      await store.deleteEntry(name, entry.id);
      dirty = false;
      toast(`"${title}" is verwijderd.`, 'success');
      ctx.navigate(`#/c/${name}`, { force: true });
    } catch (e) {
      toast('Verwijderen mislukt: ' + e.message, 'error', 10000);
    } finally {
      ctx.setSaving(false);
    }
  }

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  };
  document.addEventListener('keydown', onKey);
  updateStatus();

  const heading = h('h1', {}, isFile ? col.label : entry ? entryTitle(col, entry.data, entry.id) : `Nieuw ${col.labelSingular}`);
  const el = h('div', { class: 'view view-edit' },
    backLink(col),
    h('div', { class: 'view-header' }, heading),
    col.description && isFile ? h('p', { class: 'lead' }, col.description) : null,
    h('div', { class: 'edit-layout' },
      h('div', { class: 'edit-main card' }, form.el),
      h('aside', { class: 'edit-side', 'aria-label': 'Opslaan' },
        h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, 'Opslaan'),
          h('div', { class: 'panel-body' }, statusLine, saveBtn, viewLink,
            h('p', { class: 'small muted' }, 'Na opslaan wordt de website binnen een paar minuten bijgewerkt.'),
            deleteBtn ? h('div', { class: 'danger-zone' }, deleteBtn) : null)))));

  if (!entry && !isFile) setTimeout(() => el.querySelector('input, select, textarea')?.focus(), 0);

  return { el, canLeave: () => !dirty, destroy: () => document.removeEventListener('keydown', onKey) };
}

function backLink(col) {
  return col.kind === 'file'
    ? h('a', { class: 'back-link', href: '#/' }, icon('back', 18), 'Terug naar het overzicht')
    : h('a', { class: 'back-link', href: `#/c/${col.name}` }, icon('back', 18), `Terug naar ${col.label.toLowerCase()}`);
}
