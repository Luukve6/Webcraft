// Demoversie: de nagebootste GitHub draait helemaal in de browser.
// Alleen actief als admin/config.json "demo": true bevat (de demo-zip).
// Wijzigingen worden in deze browser bewaard (IndexedDB), niet in GitHub.

import { createMockGitHub } from './lib/mock-github.js';
import { base64ToBytes } from './lib/github.js';

const STORE = 'bestanden';
const KEY = 'huidig';
let DB = 'cms-demo';

/** Elke demo (CMS-demo, demo van een eigen site) bewaart apart, ook al draaien ze op hetzelfde adres. */
export function demoDbName(config) {
  return `cms-demo-${config.repo.name}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const loadSaved = () => withStore('readonly', (s) => s.get(KEY)).catch(() => null);
const save = (files) => withStore('readwrite', (s) => s.put([...files.entries()], KEY));

/** Wist de opgeslagen demowijzigingen, zodat de demo opnieuw begint. */
export async function resetDemo(config) {
  DB = demoDbName(config);
  try { localStorage.removeItem(previewKey(config)); } catch { /* */ }
  try { await withStore('readwrite', (s) => s.delete(KEY)); } catch { /* niets te wissen */ }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('cms.blob.')) localStorage.removeItem(k);
  } catch { /* geen opslag beschikbaar */ }
}

let mock = null;

/** Geeft een fetch-functie die de nagebootste GitHub gebruikt. */
export async function demoFetch(config) {
  DB = demoDbName(config);
  if (!mock) {
    let seed = null;
    const saved = await loadSaved();
    if (Array.isArray(saved) && saved.length) {
      seed = new Map(saved);
    } else {
      const res = await fetch('demo-seed.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('demo-seed.json ontbreekt in de map admin/.');
      const data = await res.json();
      seed = new Map(Object.entries(data).map(([p, b64]) => [p, base64ToBytes(b64)]));
    }
    mock = createMockGitHub({
      owner: config.repo.owner,
      repo: config.repo.name,
      branch: config.repo.branch,
      token: config.mockToken,
      seed,
      onChange: async (files) => {
        await save(files);
        await updatePreview(config, files);
      },
    });
  }
  return mock.fetch;
}

/** Sleutel in localStorage waar de demo-website de nieuwe inhoud vandaan haalt. */
export function previewKey(config) {
  return `cms-demo-voorbeeld-${config.repo.name}`;
}

/**
 * Demo-website bijwerken: in het echt maakt Cloudflare of GitHub Actions de website
 * opnieuw. In de demo rekent het bouwscript van de website (config.preview.builder)
 * de nieuwe inhoud uit, en leest de website die uit localStorage.
 */
async function updatePreview(config, files) {
  if (!config.preview || !config.preview.builder) return;
  if (!globalThis.cmsVoorbeeld) await import(new URL(config.preview.builder, location.href).href);
  try {
    localStorage.setItem(previewKey(config), JSON.stringify(globalThis.cmsVoorbeeld.bouw(files)));
  } catch { /* opslag vol of geblokkeerd: de website toont dan de oude inhoud */ }
}
