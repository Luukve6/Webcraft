// Overzicht van alle pagina's of berichten.

import { h, clear, icon, toast, confirmDialog, statusBadge, timeAgo } from '../ui.js';
import { TYPES, formatDateNl } from '../lib/content.js';
import { pagePath } from '../lib/paths.js';

export function listView(ctx, type) {
  const { store } = ctx;
  const t = TYPES[type];
  let filter = 'all';
  let query = '';

  const root = h('div', { class: 'view' });
  const tbody = h('tbody');
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
    const all = store.list(type);
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

    clear(tbody);
    if (!items.length) {
      tbody.append(h('tr', {}, h('td', { colspan: 4, class: 'empty' },
        all.length ? 'Niets gevonden.' : `Er zijn nog geen ${t.plural}. Klik op "Nieuw toevoegen" om te beginnen.`)));
    }
    const siteUrl = ctx.siteUrl();
    for (const item of items) {
      const editHref = `#/${type}/edit/${encodeURIComponent(item.slug)}`;
      const live = item.status === 'published' && siteUrl ? ctx.publicUrl(type, item.slug) : null;
      tbody.append(h('tr', {},
        h('td', { class: 'col-title' },
          h('a', { href: editHref, class: 'row-title' }, item.title || '(zonder titel)'),
          h('div', { class: 'row-actions' },
            h('a', { href: editHref }, 'Bewerken'),
            live ? h('a', { href: live, target: '_blank', rel: 'noopener' }, 'Bekijken') : null,
            item.fixed ? null : h('button', { type: 'button', class: 'link-danger', onclick: () => remove(item) }, 'Verwijderen'))),
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
    h('div', { class: 'card card-flush' },
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, 'Titel'),
          h('th', { scope: 'col' }, 'Status'),
          h('th', { scope: 'col' }, 'Adres'),
          h('th', { scope: 'col' }, type === 'posts' ? 'Datum' : 'Laatst gewijzigd'))),
        tbody)),
  );
  render();
  const onChange = () => render();
  store.addEventListener('change', onChange);
  return { el: root, destroy: () => store.removeEventListener('change', onChange) };
}
