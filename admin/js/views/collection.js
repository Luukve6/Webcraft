// Overzicht en formulier voor collecties (eigen soorten inhoud uit config.json).

import { h, fill, icon, toast, confirmDialog, modal, dragHandle, makeSortable, moveInArray, createDelayedSaver, editAction, deleteAction, moveArrows } from '../ui.js';
import { ConflictError } from '../lib/github.js';
import { buildForm } from '../form.js';
import { validateData, mergeData, entryId, entryTitle, sortEntries, formatEuro, defaultData, referenceErrors, reorderValues, nextOrderValue } from '../lib/schema.js';

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
  const countEl = h('p', { class: 'muted small' });
  // "orderField" (bijv. volgorde): de volgorde verander je door de rijen te slepen
  const orderField = col.orderField;
  let sortable = false;
  const thead = h('thead');
  // Na slepen niet meteen opslaan: eerst nog meer kunnen slepen, na een paar seconden rust alles in één keer
  const pending = new Map(); // id -> nieuw volgordenummer (nog niet opgeslagen)
  const orderStatus = h('p', { class: 'order-status', role: 'status', hidden: true });
  const saver = createDelayedSaver({
    save: async () => {
      const list = [...pending].map(([id, v]) => {
        const e = store.getEntry(name, id);
        return e && Number(e.data?.[orderField]) !== v ? { id, data: { ...e.data, [orderField]: v } } : null;
      }).filter(Boolean);
      pending.clear();
      if (!list.length) return;
      ctx.setSaving(true);
      try { await store.saveEntries(name, list, `Volgorde van de ${col.labelPlural || col.label.toLowerCase()} aangepast`); } finally { ctx.setSaving(false); }
    },
    onState: (s, err) => showOrderState(s, err),
  });

  function showOrderState(state, err) {
    if (state === 'pending') orderStatus.textContent = 'Nieuwe volgorde wordt over een paar seconden opgeslagen… Je kunt gewoon verder schuiven.';
    else if (state === 'saving') orderStatus.textContent = 'Bezig met opslaan…';
    else if (state === 'saved') { orderStatus.textContent = ''; toast('Nieuwe volgorde opgeslagen. De website wordt bijgewerkt.', 'success'); }
    else if (state === 'error') { orderStatus.textContent = ''; toast('Volgorde opslaan mislukt: ' + err.message, 'error', 10000); render(); }
    orderStatus.hidden = !orderStatus.textContent;
  }
  const onUnload = (e) => { if (saver.busy) { saver.flush(); e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onUnload);

  const table = h('table', { class: 'table' });
  const orderHint = orderField ? h('p', { class: 'muted small order-hint' }) : null;

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

  /** Na slepen: nieuwe volgorde van `list` (de rijen van één groep) opslaan in één commit. */
  /** focus: welke knop daarna weer de focus krijgt ('.drag-handle', '.move-up', '.move-down') */
  function reorder(list, from, to, focus) {
    if (to < 0 || to >= list.length) return;
    const ordered = moveInArray(list, from, to);
    const id = ordered[to].id;
    for (const c of reorderValues(ordered, orderField)) pending.set(c.id, c.data[orderField]);
    render();
    if (focus) {
      const row = table.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
      const el = row?.querySelector(focus);
      (el && !el.disabled ? el : row?.querySelector('.drag-handle'))?.focus();
    }
    saver.schedule();
  }

  function row(entry, i, list) {
    const href = `#/c/${name}/edit/${encodeURIComponent(entry.id)}`;
    const label = `"${entryTitle(col, entry.data, entry.id)}"`;
    return h('tr', { 'data-id': entry.id },
      sortable ? h('td', { class: 'col-drag' }, dragHandle(label)) : null,
      ...columns.map((c, i) => (i === 0 || c.field === titleField
        ? h('td', { class: 'col-title', 'data-label': c.label }, h('a', { href, class: 'row-title' }, columnText(c, entry.data) || '(zonder naam)'))
        : h('td', { 'data-label': c.label, class: c.format === 'euro' ? 'num' : 'muted' }, columnText(c, entry.data)))),
      // Knoppen helemaal rechts in de rij
      h('td', { class: 'col-actions' }, h('div', { class: 'row-actions' },
        sortable && list && list.length > 1 ? moveArrows(i, list.length, (dir) => reorder(list, i, i + dir, dir < 0 ? '.move-up' : '.move-down'), label) : null,
        editAction(href),
        col.allowDelete ? deleteAction(() => remove(entry), 'Verwijderen', { ariaLabel: `"${entryTitle(col, entry.data, entry.id)}" verwijderen` }) : null)));
  }

  function render() {
    // nog niet opgeslagen volgorde (pending) gaat voor
    let entries = sortEntries(col, store.listEntries(name).map((e) => (pending.has(e.id) ? { ...e, data: { ...e.data, [orderField]: pending.get(e.id) } } : e)));
    const total = entries.length;
    if (group) entries = entries.filter((e) => String(e.data?.[col.groupBy.field] ?? '') === group);
    if (query) entries = entries.filter((e) => columns.some((c) => columnText(c, e.data).toLowerCase().includes(query)) || JSON.stringify(e.data).toLowerCase().includes(query));
    countEl.textContent = entries.length === total ? `${total} ${total === 1 ? col.labelSingular : col.labelPlural || col.label.toLowerCase()}` : `${entries.length} van de ${total}`;
    // Slepen kan niet tijdens zoeken (dan zie je niet alle rijen)
    sortable = Boolean(orderField) && !query;
    if (orderHint) orderHint.textContent = sortable ? 'Sleep een rij aan het greepje links, of gebruik de pijltjes, om de volgorde op de website te veranderen.' : 'Maak het zoekveld leeg om de volgorde te veranderen.';
    const span = columns.length + 1 + (sortable ? 1 : 0);
    fill(thead, h('tr', {}, sortable ? h('th', { class: 'col-drag', scope: 'col' }, h('span', { class: 'sr-only' }, 'Verplaatsen')) : null,
      columns.map((c) => h('th', { scope: 'col', class: c.format === 'euro' ? 'num' : null }, c.label)),
      h('th', { scope: 'col', class: 'col-actions' }, h('span', { class: 'sr-only' }, 'Acties'))));
    const bodies = [];
    const body = (list, label, header) => {
      const tb = h('tbody', {}, header || null, ...list.map((e, i) => row(e, i, list)));
      if (sortable && list.length > 1) makeSortable(tb, { items: 'tr[data-id]', onReorder: (from, to, o) => reorder(list, from, to, o.keyboard ? '.drag-handle' : null) });
      return tb;
    };
    if (!entries.length) {
      bodies.push(h('tbody', {}, h('tr', {}, h('td', { colspan: span, class: 'empty' }, total ? 'Niets gevonden.' : `Er is nog niets. Klik op "Nieuw toevoegen".`))));
    } else if (groups && !group) {
      const known = new Set(groups.map((g) => g.value));
      for (const g of [...groups, { value: null, label: 'Zonder (bestaande) ' + (col.groupBy.label || 'groep').toLowerCase() }]) {
        const inGroup = entries.filter((e) => (g.value === null ? !known.has(String(e.data?.[col.groupBy.field] ?? '')) : String(e.data?.[col.groupBy.field] ?? '') === g.value));
        if (!inGroup.length) continue;
        bodies.push(body(inGroup, g.label, h('tr', { class: 'group-row' }, h('th', { colspan: span, scope: 'colgroup' }, `${g.label} (${inGroup.length})`))));
      }
    } else {
      bodies.push(body(entries, group ? groups?.find((g) => g.value === group)?.label : ''));
    }
    fill(table, thead, ...bodies);
  }
  render();

  const el = h('div', { class: 'view' },
    h('div', { class: 'view-header' },
      h('h1', {}, col.label),
      col.allowCreate ? h('a', { class: 'btn btn-primary', href: `#/c/${name}/new` }, icon('plus', 18), 'Nieuw toevoegen') : null),
    col.description ? h('p', { class: 'lead' }, col.description) : null,
    h('div', { class: 'list-tools' }, h('div', { class: 'inline-row' }, groupSelect, countEl), search),
    orderHint, orderStatus,
    h('div', { class: 'card card-flush' }, table));
  // Bij weggaan: wat nog wacht meteen opslaan
  return { el, destroy: () => { saver.flush(); window.removeEventListener('beforeunload', onUnload); } };
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
    ? deleteAction(() => remove(), `${cap(col.labelSingular)} verwijderen`)
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
    // Volgorde: een nieuw item (of een item dat naar een andere groep gaat) komt achteraan in de groep
    if (col.orderField && !isFile) {
      const gf = col.groupBy?.field;
      const movedGroup = entry && gf && String(entry.data?.[gf] ?? '') !== String(data[gf] ?? '');
      const missing = data[col.orderField] === undefined || data[col.orderField] === null || data[col.orderField] === '';
      if (!entry || movedGroup || missing) {
        const peers = store.listEntries(name).filter((e) => (!entry || e.id !== entry.id) && (!gf || String(e.data?.[gf] ?? '') === String(data[gf] ?? '')));
        data[col.orderField] = nextOrderValue(peers, col.orderField);
      }
    }
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
  // Een vast onderdeel (bijv. Openingstijden) staat zelf in het menu: geen "terug naar het overzicht"
  return col.kind === 'file'
    ? null
    : h('a', { class: 'back-link', href: `#/c/${col.name}` }, icon('back', 18), `Terug naar ${col.label.toLowerCase()}`);
}
