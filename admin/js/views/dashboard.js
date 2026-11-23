// Overzicht (dashboard): welkom, tellers, snelle acties, recente wijzigingen.

import { h, icon, timeAgo, statusBadge, fill, confirmDialog, toast } from '../ui.js';
import { api } from '../local.js';
import { STATES } from '../publish.js';

export function dashboardView(ctx) {
  const { store, client, publisher, user } = ctx;
  const pages = store.list('pages');
  const posts = store.list('posts');
  const drafts = [...pages.map((p) => ['pages', p]), ...posts.map((p) => ['posts', p])].filter(([, i]) => i.status !== 'published');

  const stat = (n, label, href) => h('a', { class: 'stat', href }, h('span', { class: 'stat-n' }, String(n)), h('span', { class: 'stat-l' }, label));

  const commitsList = h('ul', { class: 'activity' }, h('li', { class: 'muted' }, 'Laden…'));
  if (ctx.config.cloudMode) loadHistory(ctx, commitsList);
  else client.listCommits(8).then((commits) => {
    fill(commitsList, ...commits.map((c) =>
      h('li', {},
        h('span', { class: 'activity-msg' }, c.commit.message.split('\n')[0]),
        h('span', { class: 'muted small' }, `${c.author?.login || c.commit.author?.name || ''} · ${timeAgo(c.commit.author?.date)}`))));
    if (!commits.length) fill(commitsList, h('li', { class: 'muted' }, 'Nog geen wijzigingen.'));
  }).catch(() => fill(commitsList, h('li', { class: 'muted' }, 'Kon de recente wijzigingen niet laden.')));

  const pubBox = h('div', { class: 'pub-box' });
  const renderPub = () => {
    const st = STATES[publisher.state] || STATES.idle;
    const run = publisher.run;
    fill(pubBox, 
      h('p', {}, h('span', { class: `dot dot-${st.cls}` }), ' ', h('strong', {}, st.label)),
      run && run.html_url && run.html_url !== '#' ? h('p', { class: 'small' }, h('a', { href: run.html_url, target: '_blank', rel: 'noopener' }, 'Details bekijken op GitHub')) : null,
      publisher.hosting === 'kv'
        ? h('p', { class: 'small muted' }, 'Wat je opslaat, staat meteen online: de website haalt de inhoud direct uit Cloudflare.')
        : publisher.hosting === 'local'
        ? h('p', { class: 'small muted' }, 'Je werkt op je eigen pc. Wijzigingen komen in de bestanden op deze computer (map content/) en staan pas online als je ze naar GitHub zet.')
        : publisher.hosting === 'cloudflare'
        ? h('p', { class: 'small muted' }, 'De website staat op Cloudflare Pages. Na elke opslag zet Cloudflare de nieuwe versie binnen een paar minuten online.')
        : publisher.pagesEnabled === false
        ? h('p', { class: 'small notice-warn' }, 'GitHub Pages staat nog niet aan voor deze repository. Je wijzigingen worden wel opgeslagen, maar nog niet gepubliceerd. Zie "Hulp" voor uitleg.')
        : null,
      ctx.siteUrl() ? h('p', {}, h('a', { class: 'btn btn-small', href: ctx.siteUrl(), target: '_blank', rel: 'noopener' }, icon('external', 16), 'Website bekijken')) : null);
  };
  renderPub();
  publisher.addEventListener('change', renderPub);

  const welcome = h('p', { class: 'lead' }, `Welkom${user?.name || user?.login ? ', ' + (user.name || user.login) : ''}! Wat wil je doen?`);
  const features = ctx.features;
  if (!features.posts) {
    // Website zonder berichten: tegels voor pagina's en eigen collecties (bijv. een menukaart)
    const cols = store.collections;
    const pageTile = features.pages
      ? h('a', { class: 'tile', href: '#/pages' }, icon('page', 26), h('span', { class: 'tile-title' }, 'Pagina’s'),
        h('span', { class: 'tile-sub muted small' }, `${pages.length} ${pages.length === 1 ? 'pagina' : "pagina's"} · nieuwe maken`))
      : null;
    const settingsTile = features.settings
      ? h('a', { class: 'tile', href: '#/settings' }, icon('settings', 26), h('span', { class: 'tile-title' }, 'Algemeen'),
        h('span', { class: 'tile-sub muted small' }, 'Aanpassen'))
      : null;
    const colTile = (c) => h('a', { class: 'tile', href: `#/c/${c.name}` },
      icon(c.icon, 26),
      h('span', { class: 'tile-title' }, c.label),
      h('span', { class: 'tile-sub muted small' }, c.kind === 'folder' ? `${store.listEntries(c.name).length} ${c.labelPlural || c.label.toLowerCase()}` : (c.summaryLine || 'Aanpassen')));
    // Zelfde volgorde als het menu links: Algemeen, Pagina's, daarna de rest
    const el = h('div', { class: 'view' },
      h('div', { class: 'view-header' }, h('h1', {}, 'Overzicht')),
      welcome,
      h('div', { class: 'tiles' }, settingsTile, cols.filter((c) => c.pinned).map(colTile), pageTile, cols.filter((c) => !c.pinned).map(colTile)),
      h('div', { class: 'grid-2' },
        h('section', { class: 'card' }, h('h2', {}, 'Publicatie'), pubBox),
        h('section', { class: 'card' }, h('h2', {}, 'Recente wijzigingen'), commitsList)));
    return { el, destroy: () => publisher.removeEventListener('change', renderPub) };
  }

  const el = h('div', { class: 'view' },
    h('div', { class: 'view-header' }, h('h1', {}, 'Overzicht')),
    welcome,
    h('div', { class: 'quick' },
      h('a', { class: 'btn btn-primary', href: '#/pages/new' }, icon('plus', 18), 'Nieuwe pagina'),
      h('a', { class: 'btn btn-primary', href: '#/posts/new' }, icon('plus', 18), 'Nieuw bericht'),
      h('a', { class: 'btn', href: '#/media' }, icon('image', 18), 'Foto’s uploaden')),
    h('div', { class: 'stats' },
      stat(pages.length, pages.length === 1 ? 'pagina' : "pagina's", '#/pages'),
      stat(posts.length, posts.length === 1 ? 'bericht' : 'berichten', '#/posts'),
      stat(drafts.length, drafts.length === 1 ? 'concept' : 'concepten', '#/posts'),
      stat(store.media().length, store.media().length === 1 ? 'foto' : "foto's", '#/media')),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card' }, h('h2', {}, 'Publicatie'), pubBox),
      h('section', { class: 'card' }, h('h2', {}, 'Concepten'),
        drafts.length
          ? h('ul', { class: 'activity' }, drafts.slice(0, 6).map(([type, i]) => h('li', {}, h('a', { href: `#/${type}/edit/${encodeURIComponent(i.slug)}` }, i.title), ' ', statusBadge(i.status))))
          : h('p', { class: 'muted' }, 'Geen concepten. Alles staat online.')),
      h('section', { class: 'card card-span' }, h('h2', {}, 'Recente wijzigingen'), commitsList)),
  );
  return { el, destroy: () => publisher.removeEventListener('change', renderPub) };
}

/** Cloudflare: de laatste versies uit de opslag, met "Terugzetten". */
async function loadHistory(ctx, list) {
  let items;
  try {
    items = await api(ctx.config, 'geschiedenis');
  } catch (e) {
    fill(list, h('li', { class: 'muted' }, 'Kon de versies niet laden: ' + e.message));
    return;
  }
  if (!items.length || !items[0].tijd) { fill(list, h('li', { class: 'muted' }, 'Nog geen wijzigingen.')); return; }
  fill(list, ...items.map((v) => h('li', { class: 'history-item' },
    h('span', { class: 'activity-msg' }, v.huidig ? h('strong', {}, 'Huidige versie') : (v.wat || `Versie ${v.versie}`)),
    h('span', { class: 'muted small' }, `${v.email || 'onbekend'} · ${timeAgo(v.tijd)}`),
    v.huidig ? null : h('button', { type: 'button', class: 'btn btn-small', onclick: () => restore(ctx, v) }, 'Terugzetten'))));
}

async function restore(ctx, v) {
  const wanneer = new Date(v.tijd).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
  const ok = await confirmDialog('Versie terugzetten?', `De inhoud van ${wanneer} (${v.email || 'onbekend'}) komt terug op de website. De huidige versie blijft bewaard in de lijst, dus dit kun je weer ongedaan maken. Foto's en pdf's blijven zoals ze nu zijn.`, 'Terugzetten');
  if (!ok) return;
  try {
    await api(ctx.config, `geschiedenis/${v.nummer}/terugzetten`, { method: 'POST', body: {} });
    toast('Teruggezet. De website toont deze versie meteen.', 'success');
    setTimeout(() => location.reload(), 800); // alles opnieuw laden met de teruggezette inhoud
  } catch (e) {
    toast('Terugzetten mislukt: ' + e.message, 'error', 10000);
  }
}
