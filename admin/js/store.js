// Gegevens van de website in het geheugen van de beheeromgeving,
// plus alle acties die iets opslaan (en dus een commit maken).

import { TYPES, itemPath, parseItem, serializeItem, normalizeSite, slugify } from './lib/content.js';
import { sanitizeHtml } from './lib/sanitize.js';
import { serializeData, entryTitle } from './lib/schema.js';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)$/i;
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };
const CACHE_PREFIX = 'cms.blob.';

export class Store extends EventTarget {
  /**
   * @param {object} [opts.media] waar foto's komen: { dir: map in de repository, url: adres op de website }
   */
  constructor(client, { collections = [], media = {} } = {}) {
    super();
    this.client = client;
    this.collections = collections;
    this.mediaDir = String(media.dir || 'media').replace(/\/+$/, '');
    this.mediaUrl = String(media.url || '/' + this.mediaDir).replace(/\/+$/, '');
    this.entries = new Map(); // collectie -> Map(id -> { id, path, sha, data })
    this.head = null;
    this.files = new Map();
    this.items = { pages: new Map(), posts: new Map() };
    this.site = normalizeSite();
    this.loaded = false;
    this.objectUrls = new Map();
  }

  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail })); }

  /** Tekstbestand lezen, met cache per sha (een sha verandert nooit van inhoud). */
  async readText(sha) {
    const key = CACHE_PREFIX + sha;
    try {
      const cached = localStorage.getItem(key);
      if (cached !== null) return cached;
    } catch { /* */ }
    const text = await this.client.getBlobText(sha);
    try { if (text.length < 200000) localStorage.setItem(key, text); } catch { /* opslag vol: geen probleem */ }
    return text;
  }

  async load() {
    this.head = await this.client.getHead();
    const { files, truncated } = await this.client.getTree(this.head.treeSha);
    this.files = files;
    this.truncated = truncated;

    const errors = [];
    for (const type of Object.keys(TYPES)) {
      const map = new Map();
      const prefix = TYPES[type].dir + '/';
      const entries = [...files].filter(([p]) => p.startsWith(prefix) && p.endsWith('.json') && !p.slice(prefix.length).includes('/'));
      const results = await Promise.all(entries.map(async ([path, info]) => {
        try {
          const item = parseItem(type, await this.readText(info.sha), path);
          return { path, sha: info.sha, item };
        } catch (e) {
          errors.push(e.message);
          return null;
        }
      }));
      for (const r of results) if (r) map.set(r.item.slug, r);
      this.items[type] = map;
    }
    for (const col of this.collections) {
      const map = new Map();
      const paths = col.kind === 'file'
        ? (files.has(col.file) ? [col.file] : [])
        : [...files.keys()].filter((p) => p.startsWith(col.folder + '/') && p.endsWith('.json') && !p.slice(col.folder.length + 1).includes('/'));
      await Promise.all(paths.map(async (path) => {
        const info = files.get(path);
        try {
          const data = JSON.parse(await this.readText(info.sha));
          const id = col.kind === 'file' ? col.name : path.slice(col.folder.length + 1, -5);
          map.set(id, { id, path, sha: info.sha, data });
        } catch (e) {
          errors.push(`${path}: ${e.message}`);
        }
      }));
      this.entries.set(col.name, map);
    }
    const siteInfo = files.get('content/site.json');
    this.siteSha = siteInfo ? siteInfo.sha : null;
    if (siteInfo) {
      try { this.site = normalizeSite(JSON.parse(await this.readText(siteInfo.sha))); } catch (e) { errors.push('content/site.json: ' + e.message); }
    }
    this.loaded = true;
    this.loadErrors = errors;
    this.emit('change');
    return { errors };
  }

  // ---------- Overzichten ----------

  list(type) {
    return [...this.items[type].values()].map((e) => e.item);
  }

  get(type, slug) {
    return this.items[type].get(slug) || null;
  }

  collection(name) {
    return this.collections.find((c) => c.name === name) || null;
  }

  /** Alle items van een collectie: [{ id, path, sha, data }]. */
  listEntries(name) {
    return [...(this.entries.get(name) || new Map()).values()];
  }

  getEntry(name, id) {
    return this.entries.get(name)?.get(id) || null;
  }

  /** Gegevens van een willekeurig JSON-bestand dat al geladen is (bijv. voor keuzelijsten). */
  dataAt(path) {
    for (const map of this.entries.values()) for (const e of map.values()) if (e.path === path) return e.data;
    return null;
  }

  media() {
    return [...this.files]
      .filter(([p]) => p.startsWith(this.mediaDir + '/') && IMAGE_EXT.test(p))
      .map(([path, info]) => ({ path, sha: info.sha, size: info.size, name: path.slice(this.mediaDir.length + 1), url: this.mediaPathToUrl(path) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  }

  /** Geeft een tijdelijk adres om een foto uit de repository in de browser te tonen. */
  mediaPathToUrl(path) { return this.mediaUrl + '/' + path.slice(this.mediaDir.length + 1); }

  mediaUrlToPath(url) {
    const u = String(url);
    return u.startsWith(this.mediaUrl + '/') ? this.mediaDir + '/' + u.slice(this.mediaUrl.length + 1) : u.replace(/^\//, '');
  }

  async mediaObjectUrl(url) {
    const path = this.mediaUrlToPath(url);
    const info = this.files.get(path);
    if (!info) return null;
    if (this.objectUrls.has(info.sha)) return this.objectUrls.get(info.sha);
    const bytes = await this.client.getBlobBytes(info.sha);
    const ext = path.split('.').pop().toLowerCase();
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' }));
    this.objectUrls.set(info.sha, objectUrl);
    return objectUrl;
  }

  /** In welke pagina's/berichten wordt een foto gebruikt? */
  usageOf(url) {
    const out = [];
    for (const type of Object.keys(TYPES)) {
      for (const { item } of this.items[type].values()) {
        if (item.body.includes(url) || item.image === url) out.push({ type, item });
      }
    }
    return out;
  }

  // ---------- Opslaan ----------

  afterCommit(result, message) {
    this.head = { commitSha: result.commitSha, treeSha: result.treeSha };
    for (const [path, sha] of Object.entries(result.shas)) {
      if (sha === null) this.files.delete(path);
      else this.files.set(path, { sha, size: this.files.get(path)?.size ?? 0 });
    }
    this.emit('committed', { sha: result.commitSha, message, time: new Date() });
    this.emit('change');
  }

  /**
   * Slaat een pagina of bericht op.
   * @param {string} type  'pages' of 'posts'
   * @param {object} item
   * @param {string|null} originalSlug  het adres bij het openen (null = nieuw)
   */
  async saveItem(type, item, originalSlug) {
    const t = TYPES[type];
    const clean = { ...item, body: sanitizeHtml(item.body), updated: new Date().toISOString() };
    const path = itemPath(type, clean.slug);
    const changes = [{ path, content: serializeItem(type, clean) }];
    const expected = {};
    const original = originalSlug ? this.get(type, originalSlug) : null;

    if (original && originalSlug === clean.slug) {
      expected[path] = original.sha;
    } else {
      expected[path] = null; // nieuw adres: mag nog niet bestaan
      if (original) {
        changes.push({ path: original.path, delete: true });
        expected[original.path] = original.sha;
      }
    }

    const what = `${t.single[0].toUpperCase()}${t.single.slice(1)} "${clean.title}"`;
    let message;
    if (!original) message = clean.status === 'published' ? `${what} toegevoegd en online gezet` : `${what} toegevoegd als concept`;
    else if (clean.status === 'published') message = original.item.status === 'published' ? `${what} bijgewerkt` : `${what} online gezet`;
    else message = original.item.status === 'published' ? `${what} offline gehaald (concept)` : `${what} opgeslagen als concept`;
    if (original && originalSlug !== clean.slug) message += ` (adres gewijzigd: ${originalSlug} → ${clean.slug})`;

    const result = await this.client.commit({ message: message + '\n\nVia het beheer (/admin).', changes, expected });
    if (original && originalSlug !== clean.slug) this.items[type].delete(originalSlug);
    this.items[type].set(clean.slug, { path, sha: result.shas[path], item: parseItem(type, serializeItem(type, clean), path) });
    this.afterCommit(result, message);
    return this.items[type].get(clean.slug);
  }

  async deleteItem(type, slug) {
    const entry = this.get(type, slug);
    if (!entry) return;
    const t = TYPES[type];
    const message = `${t.single[0].toUpperCase()}${t.single.slice(1)} "${entry.item.title}" verwijderd`;
    const result = await this.client.commit({
      message: message + '\n\nVia het beheer (/admin).',
      changes: [{ path: entry.path, delete: true }],
      expected: { [entry.path]: entry.sha },
    });
    this.items[type].delete(slug);
    this.afterCommit(result, message);
  }

  /**
   * Slaat een item van een collectie op (één commit).
   * @param {string} name  collectie
   * @param {string|null} id  bestaand item, of null voor nieuw
   * @param {object} data
   * @param {string} [newId]  bestandsnaam voor een nieuw item
   */
  /**
   * @param {object[]} [uploads] bestanden die mee moeten in dezelfde commit: { path, content: Uint8Array }
   */
  async saveEntry(name, id, data, newId, uploads = []) {
    const col = this.collection(name);
    const existing = id ? this.getEntry(name, id) : null;
    const entryKey = existing ? existing.id : (col.kind === 'file' ? col.name : newId);
    const path = existing ? existing.path : (col.kind === 'file' ? col.file : `${col.folder}/${newId}.json`);
    const title = col.kind === 'file' ? col.label : `${cap(col.labelSingular)} "${entryTitle(col, data, entryKey)}"`;
    let message = col.kind === 'file' ? `${title} aangepast` : `${title} ${existing ? 'aangepast' : 'toegevoegd'}`;
    if (uploads.length) message += ` (nieuw bestand: ${uploads.map((u) => u.path.split('/').pop()).join(', ')})`;
    const result = await this.client.commit({
      message: message + '\n\nVia het beheer (/admin).',
      changes: [{ path, content: serializeData(data) }, ...uploads.map((u) => ({ path: u.path, content: u.content }))],
      expected: { [path]: existing ? existing.sha : null },
    });
    if (!this.entries.has(name)) this.entries.set(name, new Map());
    const entry = { id: entryKey, path, sha: result.shas[path], data: JSON.parse(serializeData(data)) };
    this.entries.get(name).set(entryKey, entry);
    this.afterCommit(result, message);
    return entry;
  }

  async deleteEntry(name, id) {
    const col = this.collection(name);
    const entry = this.getEntry(name, id);
    if (!entry) return;
    const message = `${cap(col.labelSingular)} "${entryTitle(col, entry.data, id)}" verwijderd`;
    const result = await this.client.commit({
      message: message + '\n\nVia het beheer (/admin).',
      changes: [{ path: entry.path, delete: true }],
      expected: { [entry.path]: entry.sha },
    });
    this.entries.get(name).delete(id);
    this.afterCommit(result, message);
  }

  async saveSite(site) {
    const clean = normalizeSite(site);
    const message = 'Instellingen van de website bijgewerkt';
    const result = await this.client.commit({
      message: message + '\n\nVia het beheer (/admin).',
      changes: [{ path: 'content/site.json', content: JSON.stringify(clean, null, 2) + '\n' }],
      expected: { 'content/site.json': this.siteSha },
    });
    this.site = clean;
    this.siteSha = result.shas['content/site.json'];
    this.afterCommit(result, message);
  }

  /** Maakt een unieke, nette bestandsnaam voor een foto. */
  uniqueMediaName(fileName, taken = new Set()) {
    const dot = fileName.lastIndexOf('.');
    const ext = (dot > 0 ? fileName.slice(dot + 1) : 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const base = slugify(dot > 0 ? fileName.slice(0, dot) : fileName) || 'foto';
    let name = `${base}.${ext}`;
    let n = 2;
    while (this.files.has(this.mediaDir + '/' + name) || taken.has(name)) name = `${base}-${n++}.${ext}`;
    return name;
  }

  /** Uploadt een of meer foto's in één commit. files: [{name, bytes}] */
  async uploadMedia(files) {
    const taken = new Set();
    const changes = [];
    const expected = {};
    const names = [];
    for (const f of files) {
      const name = this.uniqueMediaName(f.name, taken);
      taken.add(name);
      names.push(name);
      changes.push({ path: this.mediaDir + '/' + name, content: f.bytes });
      expected[this.mediaDir + '/' + name] = null;
    }
    const message = files.length === 1 ? `Foto toegevoegd: ${names[0]}` : `${files.length} foto's toegevoegd`;
    const result = await this.client.commit({ message: message + '\n\nVia het beheer (/admin).', changes, expected });
    files.forEach((f, i) => {
      const p = this.mediaDir + '/' + names[i];
      this.files.set(p, { sha: result.shas[p], size: f.bytes.length });
    });
    this.afterCommit(result, message);
    return names.map((n) => this.mediaUrl + '/' + n);
  }

  async deleteMedia(path) {
    const info = this.files.get(path);
    if (!info) return;
    const message = `Foto verwijderd: ${path.split('/').pop()}`;
    const result = await this.client.commit({
      message: message + '\n\nVia het beheer (/admin).',
      changes: [{ path, delete: true }],
      expected: { [path]: info.sha },
    });
    this.afterCommit(result, message);
  }
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
