// Startpunt van de beheeromgeving: inloggen, menu, navigatie (router).

import { h, clear, icon, toast, confirmDialog, fill, closeModals, WEBCRAFT_URL } from './ui.js';
import { GitHubClient } from './lib/github.js';
import { loadSession, saveSession, clearSession } from './auth.js';
import { Store } from './store.js';
import { PublishTracker, STATES } from './publish.js';
import { loginView } from './views/login.js';
import { dashboardView } from './views/dashboard.js';
import { listView } from './views/list.js';
import { editView } from './views/edit.js';
import { mediaView } from './views/media.js';
import { settingsView } from './views/settings.js';
import { helpView } from './views/help.js';
import { collectionListView, collectionEditView } from './views/collection.js';
import { normalizeCollections } from './lib/schema.js';
import { pagePath } from './lib/paths.js';
import { useLocal, LOCAL_TOKEN } from './local.js';

const app = document.getElementById('app');

async function loadConfig() {
  const res = await fetch('config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('config.json ontbreekt in de map admin/.');
  const c = await res.json();
  // Op je eigen pc (localhost + "local" in config.json): opslaan op schijf in plaats van in GitHub.
  if (useLocal(c)) Object.assign(c, { localMode: true, mock: true, mockToken: LOCAL_TOKEN });
  if (!c.repo || !c.repo.owner || !c.repo.name) throw new Error('Vul in admin/config.json de repository in (repo.owner en repo.name).');
  return {
    apiBase: 'https://api.github.com',
    maxImageWidth: 2000,
    auth: {},
    ...c,
    repo: { branch: 'main', ...c.repo },
    collections: normalizeCollections(c.collections || []),
    // Standaardonderdelen; zet ze in config.json op false als de website ze niet gebruikt.
    features: { pages: true, posts: true, media: true, settings: true, ...(c.features || {}) },
  };
}

function showFatal(message) {
  clear(app).append(h('div', { class: 'login-screen' }, h('main', { class: 'login-card' },
    h('h1', {}, 'Er ging iets mis'), h('p', {}, message),
    h('button', { class: 'btn btn-primary', onclick: () => location.reload() }, 'Opnieuw proberen'))));
}

async function start() {
  let config;
  try {
    config = await loadConfig();
  } catch (e) {
    showFatal(e.message);
    return;
  }

  const session = loadSession();
  if (session) {
    try {
      await enter(config, session.token);
      return;
    } catch (e) {
      if (e.status === 401) clearSession();
      showLogin(config, e.status === 401 ? 'Je sessie is verlopen. Log opnieuw in.' : e.message);
      return;
    }
  }
  showLogin(config);
}

function showLogin(config, error) {
  document.title = `Inloggen – ${config.siteName ? config.siteName + ' · ' : ''}Webcraft`;
  const view = loginView({
    config,
    error,
    onToken: async (token, remember, method) => {
      await enter(config, token);
      saveSession(token, { remember, method });
    },
  });
  clear(app).append(view.el);
}

/** Controleert de token en opent de beheeromgeving. Gooit een fout als dat niet lukt. */
async function enter(config, token) {
  const client = new GitHubClient({
    token,
    owner: config.repo.owner,
    repo: config.repo.name,
    branch: config.repo.branch,
    apiBase: config.apiBase,
    fetch: config.demo ? await (await import('./demo.js')).demoFetch(config)
      : config.localMode ? await (await import('./local.js')).localFetch(config)
        : undefined,
  });
  let access;
  try {
    access = await client.checkAccess();
  } catch (e) {
    if (e.status === 401) { const err = new Error('Deze toegangssleutel is ongeldig of verlopen.'); err.status = 401; throw err; }
    if (e.status === 404) throw new Error(`Geen toegang tot de repository ${config.repo.owner}/${config.repo.name}. Controleer of je sleutel toegang heeft tot deze repository.`);
    throw e;
  }
  if (!access.canWrite) throw new Error('Je bent ingelogd, maar je hebt geen schrijfrechten op deze repository. Vraag de eigenaar om je toe te voegen.');

  const loading = h('div', { class: 'loading-screen' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', {}, 'Website laden…'));
  clear(app).append(loading);

  const store = new Store(client, { collections: config.collections, media: config.media });
  const { errors } = await store.load();
  const publisher = new PublishTracker(client, { hosting: config.localMode ? 'local' : config.hosting });
  client.getPagesEnabled().then((v) => { publisher.pagesEnabled = v; publisher.set(publisher.state); });
  publisher.checkLatest(store.head.commitSha);
  store.addEventListener('committed', (e) => publisher.track(e.detail.sha));

  const shell = new Shell({ config, client, store, publisher, user: access.user, repo: access.repo });
  shell.mount();
  if (errors.length) toast('Sommige bestanden konden niet worden gelezen: ' + errors.join(' · '), 'error', 15000);
  if (store.truncated) toast('De repository is erg groot; niet alle bestanden konden worden geladen.', 'error', 15000);
}

function navItems(config) {
  const f = config.features;
  return [
    ['#/', 'Overzicht', 'dashboard'],
    ...config.collections.map((c) => [`#/c/${c.name}`, c.label, c.icon]),
    f.pages ? ['#/pages', 'Pagina’s', 'page'] : null,
    f.posts ? ['#/posts', 'Berichten', 'post'] : null,
    f.media ? ['#/media', 'Foto’s', 'image'] : null,
    f.settings ? ['#/settings', 'Instellingen', 'settings'] : null,
    ['#/help', 'Hulp', 'help'],
  ].filter(Boolean);
}

class Shell {
  constructor(ctx) {
    this.ctx = {
      ...ctx,
      features: ctx.config.features,
      navigate: (hash, opts) => this.navigate(hash, opts),
      setSaving: (on) => this.setSaving(on),
      siteUrl: () => (ctx.config.demo || ctx.config.localMode ? location.origin : (ctx.store.site.url || ctx.config.siteUrl || '')).replace(/\/$/, ''),
      publicUrl: (type, slug) => {
        const base = this.ctx.siteUrl();
        if (!base) return null;
        if (type === 'posts') return `${base}/blog/${slug}/`;
        return slug === ctx.store.site.homepage ? `${base}/` : `${base}${pagePath(ctx.config, slug)}`;
      },
    };
    this.view = null;
    this.currentHash = null;
    this.ignoreHash = false;
  }

  mount() {
    const { user, config, publisher } = this.ctx;
    this.main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
    this.nav = h('nav', { class: 'nav', 'aria-label': 'Beheermenu' },
      h('ul', {}, navItems(config).map(([href, label, ic]) => h('li', {}, h('a', { href, dataset: { route: href } }, icon(ic), h('span', {}, label))))));

    this.statusPill = h('button', { type: 'button', class: 'status-pill', title: 'Publicatiestatus', onclick: () => {
      const run = publisher.run;
      if (run && run.html_url && run.html_url !== '#') window.open(run.html_url, '_blank', 'noopener');
      else this.navigate('#/');
    } });
    const renderPill = () => {
      const st = STATES[publisher.state] || STATES.idle;
      this.statusPill.className = `status-pill status-${st.cls}`;
      fill(this.statusPill, h('span', { class: `dot dot-${st.cls}` }), h('span', {}, st.label));
    };
    publisher.addEventListener('change', renderPill);
    renderPill();

    const refreshBtn = h('button', { type: 'button', class: 'btn btn-small btn-ghost-light', title: 'Nieuwste versie uit GitHub laden', onclick: () => this.refresh() }, 'Vernieuwen');
    const siteLink = () => {
      const url = this.ctx.siteUrl();
      return url ? h('a', { class: 'btn btn-small btn-ghost-light', href: url, target: '_blank', rel: 'noopener' }, icon('external', 16), 'Website bekijken') : null;
    };

    const siteName = () => config.siteName || this.ctx.store.site.title || 'Website';
    const brandName = h('span', { class: 'brand-name' }, siteName());
    this.ctx.store.addEventListener('change', () => { brandName.textContent = siteName(); });
    this.sidebar = h('aside', { class: 'sidebar' },
      // "logo" in config.json: logo van de site in het vierkantje (anders de eerste letter van de naam)
      h('div', { class: 'brand' }, h('span', { class: 'brand-logo', 'aria-hidden': 'true' },
        config.logo ? h('img', { src: config.logo, alt: '', width: 24, height: 24 }) : siteName()[0].toUpperCase()), brandName),
      this.nav,
      h('div', { class: 'sidebar-foot' },
        h('div', { class: 'user' },
          user.avatar_url ? h('img', { src: user.avatar_url, alt: '', class: 'avatar' }) : h('span', { class: 'avatar avatar-empty' }, (user.login || '?')[0].toUpperCase()),
          h('span', { class: 'user-name' }, user.name || user.login)),
        h('button', { type: 'button', class: 'nav-btn', onclick: () => this.logout() }, icon('logout', 18), h('span', {}, 'Uitloggen')),
        h('a', { class: 'webcraft-link', href: WEBCRAFT_URL, target: '_blank', rel: 'noopener', title: 'Over Webcraft (opent in een nieuw tabblad)' },
          h('img', { src: 'img/webcraft.svg', alt: '', width: 18, height: 18 }), h('span', {}, 'Over ', h('strong', {}, 'Webcraft')))));

    const menuBtn = h('button', { type: 'button', class: 'menu-toggle', 'aria-label': 'Menu openen', 'aria-expanded': 'false', onclick: () => {
      const open = !document.body.classList.contains('nav-open');
      document.body.classList.toggle('nav-open', open);
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    } }, icon('menu'));

    this.topbar = h('header', { class: 'topbar' },
      menuBtn,
      h('div', { class: 'topbar-right' }, this.statusPill, refreshBtn, siteLink()));

    clear(app).append(
      h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); this.main.focus(); } }, 'Direct naar de inhoud'),
      this.sidebar,
      h('div', { class: 'content' }, this.topbar, this.main),
      h('div', { class: 'nav-backdrop', onclick: () => document.body.classList.remove('nav-open') }));
    document.body.classList.add('signed-in');

    window.addEventListener('hashchange', () => this.onHashChange());
    window.addEventListener('beforeunload', (e) => {
      if (this.view && this.view.canLeave && !this.view.canLeave()) { e.preventDefault(); e.returnValue = ''; }
    });
    this.onHashChange();
  }

  setSaving(on) {
    const p = this.ctx.publisher;
    if (on) { this.prevState = [p.state, p.run]; p.set('saving', null); }
    else if (p.state === 'saving' && this.prevState) p.set(...this.prevState); // opslaan mislukt
  }

  async refresh() {
    if (this.view && this.view.canLeave && !this.view.canLeave()) {
      const ok = await confirmDialog('Niet-opgeslagen wijzigingen', 'Als je vernieuwt, gaan je niet-opgeslagen wijzigingen verloren. Doorgaan?', 'Vernieuwen', { danger: true });
      if (!ok) return;
    }
    try {
      await this.ctx.store.load();
      this.render(true);
      toast('De nieuwste versie is geladen.', 'success', 3000);
    } catch (e) {
      toast('Vernieuwen mislukt: ' + e.message, 'error');
    }
  }

  async logout() {
    if (this.view && this.view.canLeave && !this.view.canLeave()) {
      const ok = await confirmDialog('Niet-opgeslagen wijzigingen', 'Je hebt wijzigingen die nog niet zijn opgeslagen. Toch uitloggen?', 'Uitloggen', { danger: true });
      if (!ok) return;
    }
    clearSession();
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('cms.blob.')) localStorage.removeItem(k);
    } catch { /* */ }
    location.hash = '';
    location.reload();
  }

  navigate(hash, { replace = false, force = false } = {}) {
    if (force && this.view) this.view.canLeave = () => true;
    if (replace) {
      history.replaceState(null, '', hash);
      this.onHashChange();
    } else if (location.hash === hash) {
      this.onHashChange();
    } else {
      location.hash = hash;
    }
  }

  async onHashChange() {
    if (this.ignoreHash) { this.ignoreHash = false; return; }
    const hash = location.hash || '#/';
    if (hash === this.currentHash) return;
    closeModals(); // bijv. een fotokiezer die nog openstond bij de terugknop van de browser
    if (this.view && this.view.canLeave && !this.view.canLeave()) {
      const ok = await confirmDialog('Niet-opgeslagen wijzigingen', 'Je hebt wijzigingen die nog niet zijn opgeslagen. Wil je deze pagina toch verlaten?', 'Ja, verlaten', { danger: true, cancelLabel: 'Blijven' });
      if (!ok) {
        // Adresbalk terugzetten zonder opnieuw te navigeren
        this.ignoreHash = true;
        history.replaceState(null, '', this.currentHash);
        this.ignoreHash = false;
        return;
      }
    }
    this.currentHash = hash;
    this.render();
  }

  render(keepScroll = false) {
    const hash = this.currentHash || '#/';
    const parts = hash.replace(/^#\/?/, '').split('/').map((p) => decodeURIComponent(p));
    const [section, action, slug] = parts;
    if (this.view && this.view.destroy) this.view.destroy();
    document.body.classList.remove('nav-open');

    let view; let active = '#/';
    const f = this.ctx.features;
    const col = section === 'c' ? this.ctx.store.collection(action) : null;
    if (!section) { view = dashboardView(this.ctx); document.title = 'Overzicht'; }
    else if (col) {
      active = `#/c/${col.name}`;
      const [, , sub, id] = parts;
      if (sub === 'new' && col.allowCreate) view = collectionEditView(this.ctx, col.name, null);
      else if (sub === 'edit' && id) view = collectionEditView(this.ctx, col.name, id);
      else view = collectionListView(this.ctx, col.name);
      document.title = col.label;
    } else if ((section === 'pages' && f.pages) || (section === 'posts' && f.posts)) {
      active = `#/${section}`;
      if (action === 'new') view = editView(this.ctx, section, null);
      else if (action === 'edit' && slug) view = editView(this.ctx, section, slug);
      else view = listView(this.ctx, section);
      document.title = section === 'pages' ? 'Pagina’s' : 'Berichten';
    } else if (section === 'media' && f.media) { active = '#/media'; view = mediaView(this.ctx); document.title = 'Foto’s'; }
    else if (section === 'settings' && f.settings) { active = '#/settings'; view = settingsView(this.ctx); document.title = 'Instellingen'; }
    else if (section === 'help') { active = '#/help'; view = helpView(this.ctx); document.title = 'Hulp'; }
    else {
      view = { el: h('div', { class: 'view' }, h('h1', {}, 'Pagina niet gevonden'), h('a', { class: 'btn', href: '#/' }, 'Naar het overzicht')) };
    }
    document.title += ' – Webcraft';
    this.view = view;
    for (const a of this.nav.querySelectorAll('a')) {
      const on = a.dataset.route === active;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    clear(this.main).append(view.el);
    if (!keepScroll) window.scrollTo(0, 0);
  }
}

start();
