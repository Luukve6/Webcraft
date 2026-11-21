// Overzicht van alle pagina's of berichten.

import { h, clear, icon, toast, confirmDialog, statusBadge, timeAgo, dragHandle, makeSortable, moveInArray, createDelayedSaver, editAction, viewAction, deleteAction } from '../ui.js';
import { TYPES, formatDateNl } from '../lib/content.js';
import { pagePath } from '../lib/paths.js';

export function listView(ctx, type) {
  const { store } = ctx;
  const t = TYPES[type];
  let filter = 'all';
  let query = '';

  const root = h('div', { class: 'view' });
  const tbody = h('tbody');
  const thead = h('thead');
  // Pagina's: de volgorde in het menu verander je door te slepen (alleen bij "Alles" en zonder zoeken)
  let sortable = false;
  let shown = [];
  const orderHint = type === 'pages' ? h('p', { class: 'muted small order-hint' }) : null;

  // Na slepen niet meteen opslaan: eerst nog meer kunnen slepen, na een paar seconden rust alles in één keer
  const pending = new Map(); // adres -> nieuwe plek in het menu (nog niet opgeslagen)
  const orderStatus = h('p', { class: 'order-status', role: 'status', hidden: true });
  const saver = createDelayedSaver({
    save: async () => {
      const items = [...pending].map(([slug, order]) => {
        const cur = store.get(type, slug);
        return cur && cur.item.menuOrder !== order ? { ...cur.item, menuOrder: order } : null;
      }).filter(Boolean);
      pending.clear();
      if (!items.length) return;
      ctx.setSaving(true);
      try { await store.saveItems(type, items, 'Volgorde van de pagina’s in het menu aangepast'); } finally { ctx.setSaving(false); }
    },
    onState: (s, err) => showOrderState(s, err),
  });

  function showOrderState(state, err) {
    if (state === 'pending') orderStatus.textContent = 'Nieuwe volgorde wordt over een paar seconden opgeslagen… Je kunt gewoon verder slepen.';
    else if (state === 'saving') orderStatus.textContent = 'Bezig met opslaan…';
    else if (state === 'saved') { orderStatus.textContent = ''; toast('Nieuwe volgorde opgeslagen. De website wordt bijgewerkt.', 'success'); }
    else if (state === 'error') { orderStatus.textContent = ''; toast('Volgorde opslaan mislukt: ' + err.message, 'error', 10000); render(); }
    orderStatus.hidden = !orderStatus.textContent;
  }
  const onUnload = (e) => { if (saver.busy) { saver.flush(); e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onUnload);

  function reorder(from, to, keyboard) {
    const ordered = moveInArray(shown, from, to);
    const slug = ordered[to].slug;
    ordered.forEach((item, i) => { const order = (i + 1) * 10; if (item.menuOrder !== order) pending.set(item.slug, order); });
    render();
    if (keyboard) tbody.querySelector(`tr[data-id="${CSS.escape(slug)}"] .drag-handle`)?.focus();
    saver.schedule();
  }
  makeSortable(tbody, { items: 'tr[data-id]', enabled: () => sortable, onReorder: (from, to, o) => reorder(from, to, o.keyboard) });
  const counts = h('div', { class: 'filters', role: 'tablist', 'aria-label': 'Filter' });
  const search = h('input', { type: 'search', class: 'search', placeholder: `Zoek in ${t.plural}…`, 'aria-label': `Zoek in ${t.plural}`, oninput: () => { query = search.value.toLowerCase(); render(); } });

  async function remove(item) {
    const ok = await confirmDialog(
      `${t.single[0].toUpperCase()}${t.single.slice(1)} verwijderen`,
      `Weet je zeker dat je "${item.title}" wilt verwijderen? ${item.status === 'published' ? 'Hij verdwijnt dan ook van de website. ' : ''}Dit kan alleen via GitHub worden teruggedraaid.`,
      'Verwijderen', { danger: true });
    if (!ok) return;
    try {
      await store.deleteItem(type, item.slug);
      toast(`"${item.title}" is verwijderd.`, 'success');
      render();
    } catch (e) {
      toast('Verwijderen mislukt: ' + e.message, 'error', 10000);
    }
  }

  function render() {
    // nog niet opgeslagen volgorde (pending) gaat voor
    const all = store.list(type).map((i) => (pending.has(i.slug) ? { ...i, menuOrder: pending.get(i.slug) } : i));
    const n = { all: all.length, published: all.filter((i) => i.status === 'published').length, draft: all.filter((i) => i.status !== 'published').length };
    clear(counts);
    for (const [key, label] of [['all', 'Alles'], ['published', 'Online'], ['draft', 'Concepten']]) {
      counts.append(h('button', { type: 'button', role: 'tab', class: 'filter' + (filter === key ? ' active' : ''), 'aria-selected': filter === key ? 'true' : 'false', onclick: () => { filter = key; render(); } }, `${label} (${n[key]})`));
    }

    let items = all.filter((i) => filter === 'all' || (filter === 'published' ? i.status === 'published' : i.status !== 'published'));
    if (query) items = items.filter((i) => i.title.toLowerCase().includes(query) || i.slug.includes(query));
    items.sort(type === 'posts'
      ? (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
      : (a, b) => (a.menuOrder - b.menuOrder) || a.title.localeCompare(b.title, 'nl'));

    sortable = type === 'pages' && filter === 'all' && !query && items.length > 1;
    shown = items;
    if (orderHint) orderHint.textContent = sortable ? 'Sleep een pagina aan het greepje links om de volgorde in het menu te veranderen.' : 'Kies "Alles" en maak het zoekveld leeg om de volgorde te veranderen.';
    clear(thead);
    thead.append(h('tr', {},
      sortable ? h('th', { scope: 'col', class: 'col-drag' }, h('span', { class: 'sr-only' }, 'Verplaatsen')) : null,
      h('th', { scope: 'col' }, 'Titel'),
      h('th', { scope: 'col' }, 'Status'),
      h('th', { scope: 'col' }, 'Adres'),
      h('th', { scope: 'col' }, type === 'posts' ? 'Datum' : 'Laatst gewijzigd')));
    clear(tbody);
    if (!items.length) {
      tbody.append(h('tr', {}, h('td', { colspan: 5, class: 'empty' },
        all.length ? 'Niets gevonden.' : `Er zijn nog geen ${t.plural}. Klik op "Nieuw toevoegen" om te beginnen.`)));
    }
    const siteUrl = ctx.siteUrl();
    for (const item of items) {
      const editHref = `#/${type}/edit/${encodeURIComponent(item.slug)}`;
      const live = item.status === 'published' && siteUrl ? ctx.publicUrl(type, item.slug) : null;
      tbody.append(h('tr', { 'data-id': item.slug },
        sortable ? h('td', { class: 'col-drag' }, dragHandle(`"${item.title || item.slug}"`)) : null,
        h('td', { class: 'col-title' },
          h('a', { href: editHref, class: 'row-title' }, item.title || '(zonder titel)'),
          h('div', { class: 'row-actions' },
            editAction(editHref),
            live ? viewAction(live) : null,
            item.fixed ? null : deleteAction(() => remove(item), 'Verwijderen', { ariaLabel: `"${item.title}" verwijderen` }))),
        h('td', { 'data-label': 'Status' }, statusBadge(item.status), item.fixed ? h('span', { class: 'badge', title: 'Bestaande pagina met een eigen ontwerp' }, ' vaste pagina') : null,
          type === 'pages' && !item.inMenu ? h('span', { class: 'badge' }, ' niet in menu') : null),
        h('td', { 'data-label': 'Adres', class: 'muted' }, type === 'posts' ? `/blog/${item.slug}/` : (item.slug === store.site.homepage ? '/ (homepagina)' : pagePath(ctx.config, item.slug))),
        h('td', { 'data-label': type === 'posts' ? 'Datum' : 'Gewijzigd', class: 'muted' }, type === 'posts' ? formatDateNl(item.date) : timeAgo(item.updated))));
    }
  }

  root.append(
    h('div', { class: 'view-header' },
      h('h1', {}, t.label),
      h('a', { class: 'btn btn-primary', href: `#/${type}/new` }, icon('plus', 18), 'Nieuw toevoegen')),
    h('div', { class: 'list-tools' }, counts, search),
    orderHint, orderStatus,
    h('div', { class: 'card card-flush' },
      h('table', { class: 'table' }, thead, tbody)),
  );
  render();
  const onChange = () => render();
  store.addEventListener('change', onChange);
  return { el: root, destroy: () => { saver.flush(); window.removeEventListener('beforeunload', onUnload); store.removeEventListener('change', onChange); } };
}
