// Opslag in Cloudflare KV (binding WEBCRAFT_DATA). Sleutels:
//   files      { versie, tijd, email, bestanden: { pad: base64 } }  alles wat het beheer bewerkt
//   history    de laatste 10 versies (alleen tekstbestanden; foto's en pdf's niet)
//   users      [{ email, rol: "admin" | "editor" }]
//   inhoud.js  de gebouwde inhoud voor de website (site.js bepaalt wat dat is)
//   site       kleine gegevens voor de website (nieuwe pagina's, naam/adres)
//   bin:<url>  losse bestanden (pdf, foto) zoals bezoekers ze opvragen, bijv. bin:/assets/docs/menu.pdf

import { SITE_DIR, bouwSite } from './site.js';

const MAX_HISTORY = 10;
const MAX_BYTES = 15 * 1024 * 1024;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const kv = (env) => env.WEBCRAFT_DATA;
const b64ToBytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const isTekst = (p) => p.endsWith('.json');
const tekstBestanden = (map) => Object.fromEntries(Object.entries(map).filter(([p]) => isTekst(p)));

// Alleen inhoud mag via het beheer veranderen, nooit de code of het ontwerp van de site.
const TOEGESTAAN = [
  /^content\/[a-z0-9_-]+(\/[a-z0-9_-]+)*\.json$/i,
  new RegExp(`^${SITE_DIR}/assets/(docs|img/fotos)/[a-z0-9_.-]+\\.(pdf|jpe?g|png|webp|gif)$`, 'i'),
];
export const padToegestaan = (p) => typeof p === 'string' && !p.includes('..') && TOEGESTAAN.some((re) => re.test(p));

/** Pad in de repository -> adres op de website (voor pdf's en foto's). */
const publiekPad = (p) => p.slice(SITE_DIR.length);

function controleer(p, b64) {
  if (!padToegestaan(p)) throw new HttpError(400, `Dit bestand mag niet via het beheer worden aangepast: ${p}`);
  let bytes;
  try { bytes = b64ToBytes(b64); } catch { throw new HttpError(400, `Ongeldige inhoud: ${p}`); }
  if (bytes.length > MAX_BYTES) throw new HttpError(413, `Te groot (max 15 MB): ${p}`);
  if (isTekst(p)) {
    try { JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new HttpError(400, `Geen geldige JSON: ${p}`); }
  } else if (p.toLowerCase().endsWith('.pdf') && String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') {
    throw new HttpError(400, `Geen PDF: ${p}`);
  }
}

export async function leesAlles(env) {
  return (await kv(env).get('files', 'json')) || { versie: 0, tijd: null, email: null, bestanden: {} };
}

/** Slaat een nieuwe stand op: oude stand naar de geschiedenis, website opnieuw opbouwen. */
async function bewaar(env, oud, bestanden, email, wat) {
  const versie = oud.versie + 1;
  const tijd = new Date().toISOString();
  const map = new Map(Object.entries(bestanden).map(([p, b]) => [p, b64ToBytes(b)]));
  const { inhoudJs, meta } = bouwSite(map); // eerst bouwen: gaat dat mis, dan is er niets opgeslagen

  // Losse bestanden voor bezoekers bijwerken (alleen wat veranderd is)
  for (const [p, b] of Object.entries(bestanden)) {
    if (!isTekst(p) && oud.bestanden[p] !== b) await kv(env).put('bin:' + publiekPad(p), map.get(p));
  }
  for (const p of Object.keys(oud.bestanden)) if (!isTekst(p) && !(p in bestanden)) await kv(env).delete('bin:' + publiekPad(p));
  await kv(env).put('inhoud.js', inhoudJs);
  await kv(env).put('site', JSON.stringify(meta));

  if (oud.versie > 0) {
    const hist = (await kv(env).get('history', 'json')) || [];
    hist.unshift({ versie: oud.versie, tijd: oud.tijd, email: oud.email, wat: oud.wat || '', bestanden: tekstBestanden(oud.bestanden) });
    await kv(env).put('history', JSON.stringify(hist.slice(0, MAX_HISTORY)));
  }
  await kv(env).put('files', JSON.stringify({ versie, tijd, email, wat, bestanden }));
  return versie;
}

/** Wijzigingen van het beheer: { schrijf: { pad: base64 }, verwijder: [pad], versie } */
export async function schrijf(env, body, email) {
  const { schrijf: nieuw = {}, verwijder = [], versie } = body || {};
  const cur = await leesAlles(env);
  // Iemand anders heeft intussen opgeslagen: niet over diens werk heen schrijven
  if (versie !== undefined && versie !== null && Number(versie) !== cur.versie) {
    throw new HttpError(409, 'Iemand anders heeft intussen iets opgeslagen. Klik op "Vernieuwen" en doe je wijziging opnieuw.');
  }
  for (const [p, b] of Object.entries(nieuw)) controleer(p, b);
  for (const p of verwijder) if (!padToegestaan(p)) throw new HttpError(400, `Dit bestand mag niet worden verwijderd: ${p}`);
  const bestanden = { ...cur.bestanden, ...nieuw };
  for (const p of verwijder) delete bestanden[p];
  const n = Object.keys(nieuw).length + verwijder.length;
  return bewaar(env, cur, bestanden, email, `${n} ${n === 1 ? 'bestand' : 'bestanden'} aangepast`);
}

/** Overzicht van de geschiedenis (zonder de bestanden zelf). Nummer 0 = de huidige versie. */
export async function geschiedenis(env) {
  const cur = await leesAlles(env);
  const hist = (await kv(env).get('history', 'json')) || [];
  return [
    { nummer: 0, versie: cur.versie, tijd: cur.tijd, email: cur.email, wat: cur.wat || '', huidig: true },
    ...hist.map((h, i) => ({ nummer: i + 1, versie: h.versie, tijd: h.tijd, email: h.email, wat: h.wat || '' })),
  ];
}

/** Zet een oudere versie terug (tekstbestanden; foto's en pdf's blijven zoals ze nu zijn). */
export async function terugzetten(env, nummer, email) {
  const hist = (await kv(env).get('history', 'json')) || [];
  const oud = hist[nummer - 1];
  if (!oud) throw new HttpError(404, 'Deze versie bestaat niet (meer).');
  const cur = await leesAlles(env);
  const bestanden = { ...Object.fromEntries(Object.entries(cur.bestanden).filter(([p]) => !isTekst(p))), ...oud.bestanden };
  const wanneer = oud.tijd ? new Date(oud.tijd).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }) : `versie ${oud.versie}`;
  return bewaar(env, cur, bestanden, email, `Versie van ${wanneer} teruggezet`);
}

// ---------- Gebruikers ----------

const ROLLEN = ['admin', 'editor'];
const isEmail = (s) => /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(s);

export async function gebruikers(env) {
  return (await kv(env).get('users', 'json')) || [];
}

/** Rol van dit e-mailadres. De allereerste persoon die inlogt, wordt automatisch admin. */
export async function rolVan(env, email) {
  const lijst = await gebruikers(env);
  if (!lijst.length) {
    await kv(env).put('users', JSON.stringify([{ email, rol: 'admin' }]));
    return 'admin';
  }
  return (lijst.find((u) => u.email === email) || {}).rol || null;
}

export async function bewaarGebruikers(env, lijst, ik) {
  if (!Array.isArray(lijst)) throw new HttpError(400, 'Ongeldige lijst.');
  const schoon = [];
  for (const u of lijst) {
    const email = String((u && u.email) || '').trim().toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, `Geen geldig e-mailadres: ${email || '(leeg)'}`);
    if (!ROLLEN.includes(u.rol)) throw new HttpError(400, `Onbekende rol voor ${email}.`);
    if (schoon.some((x) => x.email === email)) throw new HttpError(400, `${email} staat er twee keer in.`);
    schoon.push({ email, rol: u.rol });
  }
  // Jezelf buitensluiten kan niet: er blijft altijd minstens één admin, en dat ben jij zelf ook.
  if (!schoon.some((u) => u.email === ik && u.rol === 'admin')) throw new HttpError(400, 'Je kunt jezelf niet verwijderen of je eigen admin-rol afnemen.');
  await kv(env).put('users', JSON.stringify(schoon));
  return schoon;
}
