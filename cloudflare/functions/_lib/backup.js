// Veilige, inspecteerbare export van één Webcraft-site. Deze module leest uitsluitend
// de inhoudsgegevens van de gekoppelde KV-namespace; gebruikers, Access-configuratie
// en andere Cloudflare-instellingen horen bewust niet in een websiteback-up thuis.

import { leesAlles } from './opslag.js';
import { bouwSite } from './site.js';

const enc = new TextEncoder();
// De bron-KV-objecten zijn zelf maximaal 25 MiB. 40 MiB laat ruimte voor het
// lezen, valideren en streamen binnen de 128 MiB Worker-limiet.
const MAX_EXPORT_BYTES = 40 * 1024 * 1024;
const b64Bytes = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const safePath = (path) => String(path).split('/').map(encodeURIComponent).join('/');

function cleanVersion(version = {}) {
  const { email, bestanden = {}, ...rest } = version;
  return { ...rest, bestanden };
}
async function digest(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Bouwt de inhoud van de ZIP onder gewone, inspecteerbare bestandsnamen. */
export async function maakBackup(env) {
  const siteId = String(env.WEBCRAFT_SITE_ID || '').trim();
  if (!siteId) throw Object.assign(new Error('Deze site mist de beveiligde instelling WEBCRAFT_SITE_ID. Een back-up kan daarom niet veilig aan deze site worden gekoppeld.'), { status: 503 });
  const current = await leesAlles(env);
  const history = (await env.WEBCRAFT_DATA.get('history', 'json')) || [];
  const entries = []; let total = 0;
  const add = (path, bytes, required = true) => {
    const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    total += value.byteLength;
    if (total > MAX_EXPORT_BYTES) throw Object.assign(new Error('Deze back-up is te groot om veilig in één download te maken. Neem contact op met de beheerder voor een export via de uitgebreide methode.'), { status: 413 });
    entries.push({ path, bytes: value, required });
  };
  // Bouw de afgeleide bezoekersinhoud opnieuw uit exact dezelfde momentopname. Zo
  // kan een gelijktijdige opslag geen verouderde inhoud.js in de ZIP achterlaten.
  const currentFiles = new Map();
  for (const [path, base64] of Object.entries(current.bestanden || {})) {
    const bytes = b64Bytes(base64); currentFiles.set(path, bytes); add(`data/current/${safePath(path)}`, bytes);
  }
  for (const [index, version] of history.entries()) {
    const prefix = `data/history/${String(index + 1).padStart(3, '0')}`;
    const clean = cleanVersion(version);
    const metadata = { ...clean, bestanden: undefined };
    add(`${prefix}/versie.json`, enc.encode(JSON.stringify(metadata, null, 2) + '\n'));
    for (const [path, base64] of Object.entries(clean.bestanden || {})) add(`${prefix}/${safePath(path)}`, b64Bytes(base64));
  }
  const generated = bouwSite(currentFiles);
  add('generated/inhoud.js', enc.encode(generated.inhoudJs), false);
  add('generated/site.json', enc.encode(JSON.stringify(generated.meta, null, 2) + '\n'), false);
  const checksums = {};
  for (const entry of entries) checksums[entry.path] = { sha256: await digest(entry.bytes), bytes: entry.bytes.byteLength, required: entry.required };
  const missing = [{ id: 'pages-deployment', label: 'Gepubliceerde vaste HTML-, CSS- en JavaScriptbestanden', reason: 'De huidige Pages Function heeft geen veilige leesverbinding naar de statische deploymentbundle.', recovery: 'Bewaar bij elke deployment ook de bronmap of een deployment-archief buiten Webcraft. Dat archief kan naast deze ZIP worden bewaard.' }];
  const manifest = {
    format: 'webcraft-backup', formatVersion: 1, createdAt: new Date().toISOString(), site: { id: siteId }, status: 'partial',
    includes: ['huidige bewerkbare inhoud', 'media', 'gegenereerde bezoekersinhoud', 'tekstversiegeschiedenis'],
    excludes: ['gebruikers en rollen', 'Cloudflare Access-instellingen', 'tokens, wachtwoorden, sleutels en overige geheimen'], missing,
    current: cleanVersion({ ...current, bestanden: undefined }), checksums,
    restore: { supported: false, reason: 'Herstellen wordt pas beschikbaar nadat deze export in een afzonderlijke testomgeving is gevalideerd.' },
  };
  add('manifest.json', enc.encode(JSON.stringify(manifest, null, 2) + '\n'));
  add('LEESMIJ.txt', enc.encode(['Webcraft websitegegevens-back-up', '', 'Open manifest.json voor de volledige inhoud, controlesommen en ontbrekende onderdelen.', 'data/current bevat de huidige bewerkbare inhoud en media onder hun oorspronkelijke paden.', 'data/history bevat eerdere tekstversies. E-mailadressen van bewerkers zijn bewust niet opgenomen.', 'generated bevat de afgeleide gegevens die de website nu gebruikt.', '', 'Deze export bevat GEEN Cloudflare Access, gebruikers, tokens, wachtwoorden of sleutels.', 'Deze export bevat nog niet de vaste Pages-deployment (HTML/CSS/JS). Bewaar daarvoor ook het deployment-archief of de bronmap.', 'De status is daarom gedeeltelijk, niet volledig.'].join('\n') + '\n'));
  return { entries, manifest, bytes: entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0), complete: false };
}

// Kleine ZIP-writer zonder externe afhankelijkheid. STORE houdt ieder opgenomen bestand inspecteerbaar.
const CRC = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u16 = (n) => Uint8Array.of(n & 255, (n >>> 8) & 255);
const u32 = (n) => Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
function join(...parts) { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; }
function dosDate(d = new Date()) { return { time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) >>> 0, date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) >>> 0 }; }
export function zipStream(entries) {
  const iterator = async function* () {
    let offset = 0; const index = []; const stamp = dosDate();
    for (const entry of entries) {
      const name = enc.encode(entry.path); const body = entry.bytes; const crc = crc32(body);
      const local = join(u32(0x04034b50), u16(20), u16(0), u16(0), u16(stamp.time), u16(stamp.date), u32(crc), u32(body.length), u32(body.length), u16(name.length), u16(0), name);
      yield local; yield body; index.push({ name, crc, size: body.length, offset }); offset += local.length + body.length;
    }
    const start = offset;
    for (const file of index) { const central = join(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(stamp.time), u16(stamp.date), u32(file.crc), u32(file.size), u32(file.size), u16(file.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(file.offset), file.name); yield central; offset += central.length; }
    yield join(u32(0x06054b50), u16(0), u16(0), u16(index.length), u16(index.length), u32(offset - start), u32(start), u16(0));
  }();
  return new ReadableStream({ async pull(controller) { const { value, done } = await iterator.next(); if (done) controller.close(); else controller.enqueue(value); } });
}

/** Server-side controle van het beperkte, huidige deel van een uitgepakte Webcraft-ZIP. */
export async function controleerHerstel(env, body) {
  const { manifest, archief } = body || {};
  if (!manifest || manifest.format !== 'webcraft-backup' || manifest.formatVersion !== 1) throw Object.assign(new Error('Dit is geen ondersteunde Webcraft-back-up.'), { status: 400 });
  if (manifest.site?.id !== String(env.WEBCRAFT_SITE_ID || '')) throw Object.assign(new Error('Deze back-up hoort bij een andere website en mag hier niet worden hersteld.'), { status: 403 });
  if (!archief || typeof archief !== 'object') throw Object.assign(new Error('De uitgepakte websitebestanden ontbreken.'), { status: 400 });
  const out = {}; const history = new Map();
  for (const [zipPath, base64] of Object.entries(archief)) {
    const entry = manifest.checksums?.[zipPath];
    let raw; try { raw = b64Bytes(base64); } catch { throw Object.assign(new Error(`Ongeldige inhoud: ${zipPath}`), { status: 400 }); }
    if (!entry || entry.sha256 !== await digest(raw)) throw Object.assign(new Error(`Controle mislukt voor ${zipPath}. De back-up is beschadigd of aangepast.`), { status: 400 });
    if (zipPath.startsWith('data/current/')) {
      const path = decodeURIComponent(zipPath.slice('data/current/'.length));
      if (!path.startsWith('content/') && !/^public\/assets\/(docs|img\/fotos)\//.test(path)) throw Object.assign(new Error(`Onverwacht bestand in de back-up: ${path}`), { status: 400 });
      out[path] = base64;
    } else if (zipPath.startsWith('data/history/')) {
      const [, , number, ...rest] = zipPath.split('/'); const item = history.get(number) || { bestanden: {} }; history.set(number, item);
      if (rest.join('/') === 'versie.json') Object.assign(item, JSON.parse(new TextDecoder().decode(raw)));
      else { const path = decodeURIComponent(rest.join('/')); if (!path.startsWith('content/')) throw Object.assign(new Error(`Ongeldig geschiedenisbestand: ${path}`), { status: 400 }); item.bestanden[path] = base64; }
    } else throw Object.assign(new Error(`Onverwacht onderdeel in de back-up: ${zipPath}`), { status: 400 });
  }
  const required = Object.keys(manifest.checksums || {}).filter((p) => p.startsWith('data/current/') || p.startsWith('data/history/'));
  if (required.some((p) => !(p in archief))) throw Object.assign(new Error('De back-up is niet volledig uitgepakt. Er wordt niets hersteld.'), { status: 400 });
  return { bestanden: out, geschiedenis: [...history.values()] };
}
