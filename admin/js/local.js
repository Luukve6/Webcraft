// Lokaal werken (op je eigen pc), zonder GitHub.
// Actief als admin/config.json "local": { "api": "/__beheer" } bevat EN het beheer op
// localhost draait. De lokale webserver van de website (bijv. tools/serve.py) levert dan:
//   GET  <api>/bestanden  -> { "pad/naar/bestand.json": "<base64>", ... }
//   POST <api>/opslaan    <- { "schrijf": { pad: "<base64>" }, "verwijder": [pad, ...] }
// De nagebootste GitHub draait in de browser; na elke opslag gaan de gewijzigde
// bestanden naar de server, die ze op schijf zet. Online (niet-localhost) doet dit niets.

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
  const api = config.local.api.replace(/\/$/, '');
  let res;
  try {
    res = await fetch(`${api}/bestanden`, { cache: 'no-store' });
  } catch {
    res = null;
  }
  if (!res || !res.ok) {
    throw new Error('Lokaal opslaan werkt alleen als de website draait via de eigen webserver (bijv. python tools/serve.py).');
  }
  const data = await res.json();
  let last = new Map(Object.entries(data).map(([p, b64]) => [p, base64ToBytes(b64)]));
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
      let r;
      try {
        r = await fetch(`${api}/opslaan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        // Geen verbinding: meestal is de lokale webserver gestopt (venster dicht, pc herstart)
        throw new Error('de lokale webserver draait niet (meer). Start hem opnieuw met "python tools/serve.py", ververs deze pagina en probeer het nog eens. Er is niets opgeslagen.');
      }
      if (!r.ok) throw new Error(`Opslaan op deze pc mislukt: ${(await r.text()) || r.status}`);
      last = new Map(files);
    },
  });

  // Bestanden kunnen ook buiten het beheer om veranderen (een ander tabblad, een editor, git pull).
  // Vóór elke keer dat het beheer "de nieuwste versie" opvraagt (laden, Vernieuwen, opslaan),
  // lezen we de schijf opnieuw en zetten verschillen als wijziging "door iemand anders" in de
  // nagebootste GitHub. Dan werken Vernieuwen en de controle "iemand anders was je voor" net als online.
  async function syncFromDisk() {
    let r;
    try { r = await fetch(`${api}/bestanden`, { cache: 'no-store' }); } catch { return; }
    if (!r.ok) return;
    const disk = new Map(Object.entries(await r.json()).map(([p, b64]) => [p, base64ToBytes(b64)]));
    const changed = [...disk].filter(([p, bytes]) => !same(last.get(p), bytes));
    const removed = [...last.keys()].filter((p) => !disk.has(p));
    for (const [p, bytes] of changed) mock.externalCommit(p, bytes, `${p} gewijzigd buiten het beheer`);
    for (const p of removed) mock.externalCommit(p, null, `${p} verwijderd buiten het beheer`);
    if (changed.length || removed.length) last = disk;
  }
  const headRe = /\/git\/ref\/heads\//;
  const base = mock.fetch;
  mock.fetch = async (url, init = {}) => {
    if ((init.method || 'GET').toUpperCase() === 'GET' && headRe.test(String(url))) await syncFromDisk();
    return base(url, init);
  };
  return mock.fetch;
}
