// Collecties: eigen soorten inhoud met formulieren (bijv. een menukaart).
// Een collectie is óf een map met één JSON-bestand per item ("folder"),
// óf één vast JSON-bestand ("file"). De velden staan in admin/config.json.
// Gebruikt door de beheeromgeving en door de tests (geen DOM nodig).

import { slugify } from './content.js';

export const WIDGETS = new Set(['string', 'text', 'number', 'boolean', 'select', 'relation', 'list', 'object', 'hidden', 'date', 'file']);

/** Controleert en vult de collecties uit config.json aan. Gooit bij fouten. */
export function normalizeCollections(list = []) {
  if (!Array.isArray(list)) throw new Error('config.json: "collections" moet een lijst zijn.');
  const names = new Set();
  return list.map((c, i) => {
    const where = `config.json, collectie ${i + 1}`;
    if (!c || !/^[a-z0-9-]+$/.test(c.name || '')) throw new Error(`${where}: "name" ontbreekt of bevat andere tekens dan a-z, 0-9 en -.`);
    if (names.has(c.name)) throw new Error(`${where}: de naam "${c.name}" komt twee keer voor.`);
    names.add(c.name);
    if (!c.folder === !c.file) throw new Error(`${where} (${c.name}): geef óf "folder" óf "file" op.`);
    const fields = normalizeFields(c.fields, `${where} (${c.name})`);
    return {
      label: c.name,
      labelSingular: c.labelSingular || c.label || c.name,
      icon: c.icon || 'page',
      description: '',
      ...c,
      kind: c.folder ? 'folder' : 'file',
      folder: c.folder ? String(c.folder).replace(/\/+$/, '') : undefined,
      fields,
      allowCreate: c.folder ? c.allowCreate !== false : false,
      allowDelete: c.folder ? c.allowDelete !== false : false,
    };
  });
}

function normalizeFields(fields, where) {
  if (!Array.isArray(fields) || !fields.length) throw new Error(`${where}: "fields" ontbreekt.`);
  return fields.map((f) => {
    if (!f || !f.name) throw new Error(`${where}: een veld heeft geen "name".`);
    const widget = f.widget || 'string';
    if (!WIDGETS.has(widget)) throw new Error(`${where}: veld "${f.name}" heeft een onbekend type "${widget}".`);
    const out = { ...f, widget, label: f.label || f.name, required: widget === 'hidden' || widget === 'boolean' ? false : f.required !== false };
    if (widget === 'object') out.fields = normalizeFields(f.fields, `${where} > ${f.name}`);
    if (widget === 'list') {
      if (f.fields) out.fields = normalizeFields(f.fields, `${where} > ${f.name}`);
      else out.field = normalizeFields([f.field || { name: 'waarde', widget: 'string' }], `${where} > ${f.name}`)[0];
      out.allowAdd = f.allowAdd !== false;
    }
    return out;
  });
}

/** Lege beginwaarde voor een veld. */
export function defaultValue(field) {
  if ('default' in field) return structuredClone(field.default);
  switch (field.widget) {
    case 'number': return null;
    case 'boolean': return false;
    case 'list': return [];
    case 'select': return field.multiple ? [] : '';
    case 'object': return defaultData(field.fields);
    default: return '';
  }
}

export function defaultData(fields) {
  const out = {};
  for (const f of fields) out[f.name] = defaultValue(f);
  return out;
}

/** Leest een getal zoals mensen het typen: "17,50", "17.5", "€ 3,-". Leeg = null. */
export function parseNumber(value, { integer = false } = {}) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? (integer ? Math.round(value) : value) : NaN;
  let s = String(value).trim().replace(/^€\s*/, '').replace(/,-$/, '').replace(/\s/g, '');
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, ''); // 1.250,50
  s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  const n = Number(s);
  if (integer && !Number.isInteger(n)) return NaN;
  return n;
}

const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Controleert gegevens tegen de velden. Geeft een object { 'pad.naar.veld': 'melding' }.
 * Leeg object = alles in orde.
 */
export function validateData(fields, data, prefix = '', errors = {}) {
  for (const f of fields) {
    const key = prefix + f.name;
    const v = data ? data[f.name] : undefined;
    if (f.widget === 'hidden') continue;
    if (f.widget === 'object') { validateData(f.fields, v || {}, key + '.', errors); continue; }
    if (f.widget === 'list') {
      const arr = Array.isArray(v) ? v : [];
      if (f.required && !arr.length && f.min !== 0) { errors[key] = 'Voeg er minstens één toe.'; continue; }
      // "unique": elke waarde maar één keer (bij een lijst met blokken: op het veld uit "unique")
      if (f.unique) {
        const vals = arr.map((item) => (f.fields ? item && item[f.unique === true ? 'id' : f.unique] : item)).filter((x) => !isEmpty(x));
        const dup = vals.find((x, i) => vals.indexOf(x) !== i);
        if (dup !== undefined) { errors[key] = `${dateText(dup)} staat er twee keer in. Haal er één weg.`; continue; }
      }
      arr.forEach((item, i) => {
        if (f.fields) validateData(f.fields, item || {}, `${key}.${i}.`, errors);
        else validateData([{ ...f.field, name: String(i) }], { [i]: item }, key + '.', errors);
      });
      continue;
    }
    if (f.required && isEmpty(v)) { errors[key] = 'Dit veld is verplicht.'; continue; }
    // Verplicht afhankelijk van een ander veld op hetzelfde niveau:
    //   "requiredUnless": "closed"  -> verplicht, behalve als dat vinkje aan staat
    //   "requiredWith": "from"      -> verplicht zodra dat andere veld is ingevuld
    const sib = (n) => (data ? data[n] : undefined);
    if (isEmpty(v) && f.requiredUnless && !sib(f.requiredUnless)) { errors[key] = f.requiredMessage || 'Vul dit in.'; continue; }
    if (isEmpty(v) && f.requiredWith && !isEmpty(sib(f.requiredWith))) { errors[key] = f.requiredMessage || 'Vul dit ook in.'; continue; }
    if (isEmpty(v)) continue;
    if (f.widget === 'number') {
      if (typeof v !== 'number' || Number.isNaN(v)) { errors[key] = f.integer ? 'Vul een heel getal in.' : 'Vul een getal in, bijvoorbeeld 17,50.'; continue; }
      if (f.min !== undefined && v < f.min) { errors[key] = `Het getal moet minstens ${f.min} zijn.`; continue; }
    }
    if (f.widget === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { errors[key] = 'Kies een geldige datum.'; continue; }
    if (f.pattern && typeof v === 'string') {
      const [re, msg] = Array.isArray(f.pattern) ? f.pattern : [f.pattern, 'De invoer klopt niet.'];
      if (!new RegExp(re).test(v)) { errors[key] = msg; continue; }
    }
    // Volgorde ten opzichte van een ander veld (datums JJJJ-MM-DD en tijden UU:MM zijn als tekst te vergelijken):
    //   "notBefore": "from" -> mag niet vóór dat veld liggen (gelijk mag)
    //   "after": "open"     -> moet er echt na liggen
    if (f.notBefore && comparable(v, sib(f.notBefore)) && String(v) < String(sib(f.notBefore))) {
      errors[key] = f.orderMessage || 'Dit mag niet eerder zijn dan het veld erboven.'; continue;
    }
    if (f.after && comparable(v, sib(f.after)) && String(v) <= String(sib(f.after))) {
      errors[key] = f.orderMessage || 'Dit moet later zijn dan het veld erboven.'; continue;
    }
  }
  return errors;
}

/** Alleen twee geldige datums (JJJJ-MM-DD) of twee geldige tijden (UU:MM) vergelijken. */
function comparable(a, b) {
  const kind = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x)) ? 'd' : /^\d{2}:\d{2}$/.test(String(x)) ? 't' : null);
  return kind(a) !== null && kind(a) === kind(b);
}

/** 2026-11-19 -> 19-11-2026 (andere waarden tussen aanhalingstekens), voor meldingen. */
function dateText(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : `"${v}"`;
}

/**
 * Voegt formulierwaarden samen met de originele gegevens, zodat velden die
 * niet in het formulier staan (of verborgen zijn) bewaard blijven.
 */
export function mergeData(fields, original, values) {
  const out = original && typeof original === 'object' && !Array.isArray(original) ? { ...original } : {};
  for (const f of fields) {
    if (f.widget === 'hidden') { if (!(f.name in out) && 'default' in f) out[f.name] = f.default; continue; }
    if (!(f.name in values)) continue;
    const v = values[f.name];
    // Lege, niet-verplichte velden die er eerst niet waren, niet toevoegen (houdt bestanden schoon).
    if (!f.required && !(f.name in out) && (v === '' || v === null || v === false || (Array.isArray(v) && !v.length))) continue;
    if (f.widget === 'object') out[f.name] = mergeData(f.fields, out[f.name], v || {});
    else if (f.widget === 'list' && f.fields) {
      const old = Array.isArray(out[f.name]) ? out[f.name] : [];
      out[f.name] = (v || []).map((item) => mergeData(f.fields, item && item.__orig !== undefined ? old[item.__orig] : undefined, item || {}));
    } else out[f.name] = v;
    // Bestand: originele bestandsnaam bewaren naast het adres (alleen bij een nieuwe upload verandert hij)
    if (f.widget === 'file' && f.nameField && values[f.nameField]) out[f.nameField] = values[f.nameField];
  }
  return out;
}

/** Vult een sjabloon als "{nummer}-{naam}" met gegevens. */
export function fillTemplate(template, data, format = (v) => (v === null || v === undefined ? '' : String(v))) {
  return String(template || '').replace(/\{([\w.]+)\}/g, (_, key) => format(key.split('.').reduce((o, k) => (o == null ? o : o[k]), data), key));
}

/** Bestandsnaam (zonder .json) voor een nieuw item in een map-collectie. */
export function entryId(collection, data) {
  const raw = fillTemplate(collection.slug || `{${collection.titleField || collection.fields[0].name}}`, data);
  return slugify(raw) || 'item';
}

/** Titel van een item om te tonen. */
export function entryTitle(collection, data, id = '') {
  const v = data ? data[collection.titleField || collection.fields[0].name] : '';
  return String(v || id || '(zonder naam)');
}

/** Bedrag in euro's, Nederlands geschreven: 17,50. */
export function formatEuro(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Sorteert items op de velden uit collection.sortBy (getallen als getal). */
export function sortEntries(collection, entries) {
  const keys = collection.sortBy || [collection.titleField || collection.fields[0].name];
  const val = (e, k) => e.data?.[k];
  return [...entries].sort((a, b) => {
    for (const k of keys) {
      const x = val(a, k); const y = val(b, k);
      const nx = parseNumber(x); const ny = parseNumber(y);
      let c;
      if (typeof nx === 'number' && typeof ny === 'number' && !Number.isNaN(nx) && !Number.isNaN(ny)) c = nx - ny;
      else c = String(x ?? '').localeCompare(String(y ?? ''), 'nl', { numeric: true });
      if (c) return c;
    }
    return a.id.localeCompare(b.id, 'nl', { numeric: true });
  });
}

export function serializeData(data) {
  return JSON.stringify(data, null, 2) + '\n';
}

/**
 * Waar een geüpload bestand komt.
 * f.folder       map in de repository, bijv. "public/assets/docs"
 * f.publicFolder adres op de website, bijv. "assets/docs" (standaard gelijk aan folder)
 * f.fileName     vaste bestandsnaam (vervangt steeds hetzelfde bestand), anders afgeleid van de originele naam
 * @returns {{ path: string, value: string }}
 */
export function uploadTarget(f, originalName) {
  const ext = (/\.[a-z0-9]+$/i.exec(originalName || '') || [''])[0].toLowerCase();
  const stem = String(originalName || 'bestand').replace(/\.[^.]*$/, '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bestand';
  const name = f.fileName || stem + ext;
  const folder = String(f.folder || '').replace(/\/+$/, '');
  const pub = String(f.publicFolder ?? folder).replace(/\/+$/, '');
  return { path: folder ? `${folder}/${name}` : name, value: pub ? `${pub}/${name}` : name };
}

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const niceDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

/**
 * "dateWindow": { "from": "from", "to": "to", "showDaysBefore": 21 } op een object-veld.
 * Geeft in gewone taal terug of er nu een melding op de website staat.
 * @param {object} cfg
 * @param {object} v  waarden van het object
 * @param {Date} [now]
 */
export function dateWindowText(cfg, v, now = new Date()) {
  const from = v[cfg.from || 'from'] || '';
  const to = v[cfg.to || 'to'] || '';
  const valid = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!from && !to) return `Er staat nu geen ${cfg.noun || 'melding'} op de website.`;
  if (!from || !to) return 'Vul allebei de datums in (of maak ze allebei leeg).';
  if (!valid(from) || !valid(to)) return 'Kies geldige datums.';
  if (to < from) return `De laatste dag (${niceDate(to)}) ligt vóór de eerste dag (${niceDate(from)}). Kijk het jaartal na.`;
  const today = isoDate(now);
  if (to < today) return `Deze periode is al voorbij, dus er staat geen melding op de website. Maak de datums leeg of vul nieuwe in.`;
  const days = Number(cfg.showDaysBefore ?? 21);
  const start = new Date(from + 'T12:00:00'); start.setDate(start.getDate() - days);
  const showFrom = isoDate(start);
  if (today < showFrom) return `De melding komt vanaf ${niceDate(showFrom)} op de website (${days} dagen vooraf) en verdwijnt na ${niceDate(to)}.`;
  return `De melding staat nu op de website en verdwijnt na ${niceDate(to)}.`;
}

/**
 * "referencedBy" op een lijst (bijv. categorieën): andere items verwijzen naar een code uit die lijst
 * (bijv. gerecht.categorie = "soepen"). Een code weghalen of veranderen terwijl er nog items naar
 * verwijzen, zou die items ongemerkt van de website laten verdwijnen. Dat wordt hier tegengehouden.
 *   "referencedBy": { "collection": "gerechten", "field": "categorie", "key": "id", "label": "gerechten" }
 */
export function referenceErrors(col, values, store, before = {}) {
  const errors = {};
  for (const f of col.fields) {
    const rb = f.widget === 'list' && f.referencedBy;
    if (!rb) continue;
    const keyField = rb.key || 'id';
    const codes = (list) => new Set((Array.isArray(list) ? list : []).map((x) => x && x[keyField]).filter(Boolean));
    const ids = codes(values[f.name]);
    // alleen codes die er vóór deze wijziging wél waren (oude, al losse koppelingen blokkeren niets)
    const gone = new Set([...codes(before && before[f.name])].filter((c) => !ids.has(c)));
    const users = store.listEntries(rb.collection).filter((e) => e.data && gone.has(e.data[rb.field]));
    if (!users.length) continue;
    const other = store.collection(rb.collection);
    const what = rb.label || other?.label?.toLowerCase() || 'items';
    const byCode = new Map();
    for (const e of users) byCode.set(e.data[rb.field], (byCode.get(e.data[rb.field]) || 0) + 1);
    const list = [...byCode].map(([code, n]) => `"${code}" (${n})`).join(', ');
    const single = f.labelSingular || 'onderdeel';
    errors[f.name] = `Niet opgeslagen: je haalt een ${single} weg (of verandert de code) waar nog ${what} in staan: ${list}. Zet die ${what} eerst in een andere ${single}, anders verdwijnen ze van de website.`;
  }
  return errors;
}

/**
 * Nieuwe volgorde na slepen. `ordered` = items (met .id en .data) in de nieuwe volgorde.
 * De bestaande volgordenummers van precies deze items worden opnieuw verdeeld (laag -> hoog),
 * zodat andere items (bijv. in een andere categorie) niet veranderen. Ontbreken er nummers of
 * zijn ze dubbel, dan wordt het 10, 20, 30, ...
 * Geeft alleen de items terug waarvan het nummer verandert: [{ id, data }].
 */
export function reorderValues(ordered, field) {
  const nums = ordered.map((e) => Number(e.data?.[field]));
  const valid = nums.every((n) => Number.isFinite(n)) && new Set(nums).size === nums.length;
  const values = valid ? [...nums].sort((a, b) => a - b) : ordered.map((_, i) => (i + 1) * 10);
  const out = [];
  ordered.forEach((e, i) => {
    if (Number(e.data?.[field]) !== values[i] || !valid) out.push({ id: e.id, data: { ...e.data, [field]: values[i] } });
  });
  return out;
}

/** Volgordenummer voor een nieuw item achteraan (in de groep, als die er is). */
export function nextOrderValue(entries, field, step = 10) {
  const nums = entries.map((e) => Number(e.data?.[field])).filter((n) => Number.isFinite(n));
  return (nums.length ? Math.max(...nums) : 0) + step;
}
