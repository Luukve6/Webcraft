// Opslaan zonder GitHub: op je eigen pc of in Cloudflare.
//
// Lokaal: admin/config.json bevat "local": { "api": "/__beheer" } EN het beheer draait op
//   localhost. De lokale webserver van de website (bijv. tools/serve.py) bewaart op schijf.
// Cloudflare: admin/config.json bevat "storage": { "api": "/admin/api" }. Pages Functions bewaren
//   in Cloudflare KV; inloggen gaat via Cloudflare Access (zie cloudflare/LEESMIJ.md).
//
// Beide servers leveren:
//   GET  <api>/bestanden  -> { "pad/naar/bestand.json": "<base64>", ... }  (Cloudflare: header X-Webcraft-Versie)
//   POST <api>/opslaan    <- { "schrijf": { pad: "<base64>" }, "verwijder": [pad, ...], "versie": n }
// De nagebootste GitHub draait in de browser; na elke opslag gaan de gewijzigde
// bestanden naar de server.

import { createMockGitHub } from './lib/mock-github.js';
import { base64ToBytes, bytesToBase64 } from './lib/github.js';

export const LOCAL_TOKEN = 'lokaal';

export function isLocalHost(hostname = location.hostname) {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}

/** True als dit beheer lokaal moet opslaan (config.local + localhost). */
export function useLocal(config) {
  return Boolean(config.local && config.local.api) && isLocalHost();
}

/** True als dit beheer in Cloudflare (KV) opslaat. */
export function useCloud(config) {
  return Boolean(config.storage && config.storage.api);
}

const apiOf = (config) => (config.cloudMode ? config.storage.api : config.local.api).replace(/\/$/, '');

/** Vraagt iets op bij de opslag-API (alleen Cloudflare: ik, geschiedenis, gebruikers). */
export async function api(config, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${apiOf(config)}/${path}`, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Fout ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function same(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Wat moet er naar de server: gewijzigde/nieuwe bestanden en verwijderde paden. */
export function diffFiles(before, after) {
  const schrijf = {};
  const verwijder = [];
  for (const [p, bytes] of after) if (!same(before.get(p), bytes)) schrijf[p] = bytesToBase64(bytes);
  for (const p of before.keys()) if (!after.has(p)) verwijder.push(p);
  return { schrijf, verwijder };
}

let mock = null;

export async function localFetch(config) {
  if (mock) return mock.fetch;
  const base = apiOf(config);
  const cloud = Boolean(config.cloudMode);
  let versie = null; // Cloudflare: welke versie we hebben; bij opslaan controleert de server of dat nog klopt

  async function readAll() {
    let res;
    try { res = await fetch(`${base}/bestanden`, { cache: 'no-store' }); } catch { res = null; }
    if (!res) {
      throw new Error(cloud ? 'Geen verbinding met de server. Controleer je internet en ververs de pagina.'
        : 'Lokaal opslaan werkt alleen als de website draait via de eigen webserver (bijv. python tools/serve.py).');
    }
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({}))).message;
      const err = new Error(msg || (cloud ? `De server gaf fout ${res.status}.` : 'Lokaal opslaan werkt alleen als de website draait via de eigen webserver (bijv. python tools/serve.py).'));
      err.status = res.status === 401 ? 401 : undefined;
      throw err;
    }
    if (res.headers.get('X-Webcraft-Versie')) versie = Number(res.headers.get('X-Webcraft-Versie'));
    return new Map(Object.entries(await res.json()).map(([p, b64]) => [p, base64ToBytes(b64)]));
  }

  let last = await readAll();
  mock = createMockGitHub({
    owner: config.repo.owner,
    repo: config.repo.name,
    branch: config.repo.branch,
    token: LOCAL_TOKEN,
    seed: new Map(last),
    onChangeRequired: true,
    onChange: async (files) => {
      const body = diffFiles(last, files);
      if (!Object.keys(body.schrijf).length && !body.verwijder.length) return;
      if (versie !== null) body.versie = versie;
      let r;
      try {
        r = await fetch(`${base}/opslaan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        // Geen verbinding: lokaal is meestal de webserver gestopt (venster dicht, pc herstart)
        throw new Error(cloud ? 'geen verbinding met de server. Controleer je internet en probeer het nog eens. Er is niets opgeslagen.'
          : 'de lokale webserver draait niet (meer). Start hem opnieuw met "python tools/serve.py", ververs deze pagina en probeer het nog eens. Er is niets opgeslagen.');
      }
      if (!r.ok) {
        const text = await r.text();
        let msg = text;
        try { msg = JSON.parse(text).message || text; } catch { /* gewone tekst */ }
        throw new Error(cloud ? msg || `fout ${r.status}` : `Opslaan op deze pc mislukt: ${msg || r.status}`);
      }
      const res = await r.json().catch(() => ({}));
      if (res.versie !== undefined) versie = res.versie;
      last = new Map(files);
    },
  });

  // Bestanden kunnen ook buiten dit beheer om veranderen (een collega, een ander tabblad, een editor).
  // Vóór elke keer dat het beheer "de nieuwste versie" opvraagt (laden, Vernieuwen, opslaan),
  // lezen we de server opnieuw en zetten verschillen als wijziging "door iemand anders" in de
  // nagebootste GitHub. Dan werken Vernieuwen en de controle "iemand anders was je voor" net als online.
  async function sync() {
    let disk;
    try { disk = await readAll(); } catch { return; }
    const changed = [...disk].filter(([p, bytes]) => !same(last.get(p), bytes));
    const removed = [...last.keys()].filter((p) => !disk.has(p));
    for (const [p, bytes] of changed) mock.externalCommit(p, bytes, `${p} gewijzigd buiten dit venster`);
    for (const p of removed) mock.externalCommit(p, null, `${p} verwijderd buiten dit venster`);
    if (changed.length || removed.length) last = disk;
  }
  const headRe = /\/git\/ref\/heads\//;
  const inner = mock.fetch;
  mock.fetch = async (url, init = {}) => {
    if ((init.method || 'GET').toUpperCase() === 'GET' && headRe.test(String(url))) await sync();
    return inner(url, init);
  };
  return mock.fetch;
}
