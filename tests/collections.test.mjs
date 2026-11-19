import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeCollections, validateData, mergeData, parseNumber, entryId, sortEntries, formatEuro, fillTemplate, defaultData,
} from '../admin/js/lib/schema.js';
import { GitHubClient, ConflictError } from '../admin/js/lib/github.js';
import { Store } from '../admin/js/store.js';
import { createMockGitHub } from '../scripts/mock-github.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KB_CONFIG = JSON.parse(await readFile(path.join(ROOT, 'sites/voorbeeld/config.json'), 'utf8'));

test('parseNumber leest getallen zoals mensen ze typen', () => {
  assert.equal(parseNumber('17,50'), 17.5);
  assert.equal(parseNumber('17.5'), 17.5);
  assert.equal(parseNumber('€ 3,-'), 3);
  assert.equal(parseNumber('1.250,50'), 1250.5);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('  '), null);
  assert.ok(Number.isNaN(parseNumber('twaalf')));
  assert.ok(Number.isNaN(parseNumber('1,5', { integer: true })));
  assert.equal(parseNumber('15', { integer: true }), 15);
  assert.equal(formatEuro(3.5), '3,50');
  assert.equal(formatEuro(null), '');
});

test('collecties uit de voorbeeldconfiguratie zijn geldig', () => {
  const cols = normalizeCollections(KB_CONFIG.collections);
  assert.deepEqual(cols.map((c) => c.name), ['gerechten', 'categorieen', 'afhaallijst', 'maandmenu', 'openingstijden', 'vakantie', 'buffet', 'catering']);
  const g = cols[0];
  assert.equal(g.kind, 'folder');
  assert.equal(g.allowCreate, true);
  assert.equal(cols[2].kind, 'file');
  assert.equal(cols[2].allowDelete, false);
  assert.equal(g.fields.find((f) => f.name === 'prijs').required, false);
  assert.equal(g.fields.find((f) => f.name === 'naam').required, true);
});

test('normalizeCollections geeft duidelijke fouten', () => {
  assert.throws(() => normalizeCollections([{ name: 'x', fields: [{ name: 'a' }] }]), /óf "folder" óf "file"/);
  assert.throws(() => normalizeCollections([{ name: 'x', file: 'a.json', fields: [{ name: 'a', widget: 'raar' }] }]), /onbekend type/);
  assert.throws(() => normalizeCollections([{ name: 'X Y', file: 'a.json', fields: [{ name: 'a' }] }]), /name/);
  assert.throws(() => normalizeCollections([{ name: 'a', file: 'a.json', fields: [{ name: 'a' }] }, { name: 'a', file: 'b.json', fields: [{ name: 'a' }] }]), /twee keer/);
});

test('validateData: verplicht, getallen, patronen, lijsten en geneste velden', () => {
  const cols = normalizeCollections(KB_CONFIG.collections);
  const g = cols[0];
  const open = cols.find((c) => c.name === 'openingstijden');
  const errs = validateData(g.fields, { naam: '', nummer: '5', prijs: NaN, categorie: '', labels: [], volgorde: null });
  assert.deepEqual(Object.keys(errs).sort(), ['categorie', 'naam', 'prijs']);
  assert.match(errs.prijs, /getal/);
  assert.deepEqual(validateData(g.fields, { naam: 'Soep', nummer: '5', prijs: null, categorie: 'soepen', labels: [], volgorde: null }), {});
  const hours = { hours: [{ label: 'Maandag', closed: false, open: '9u', close: '20:00' }], holidayHours: { open: '12:00', close: '' }, holidays: ['2026-12-25'], closedDates: [] };
  const e2 = validateData(open.fields, hours);
  assert.equal(e2['hours.0.open'], 'Schrijf de tijd als 15:30.');
  assert.equal(e2['holidayHours.close'], 'Dit veld is verplicht.');
  assert.equal(Object.keys(e2).length, 2);
});

test('mergeData bewaart velden die niet in het formulier staan en voegt geen lege extra velden toe', () => {
  const open = normalizeCollections(KB_CONFIG.collections).find((c) => c.name === 'openingstijden');
  const orig = { hours: [{ day: 1, label: 'Maandag', closed: true, note: 'Op feestdagen wel geopend' }, { day: 2, label: 'Dinsdag', open: '15:30', close: '20:00' }], extra: 'blijft' };
  const values = {
    hours: [
      { label: 'Maandag', closed: true, open: '', close: '', __orig: 0 },
      { label: 'Dinsdag', closed: true, open: '15:30', close: '20:00', __orig: 1 },
    ],
  };
  const out = mergeData(open.fields, orig, values);
  assert.deepEqual(out.hours[0], { day: 1, label: 'Maandag', closed: true, note: 'Op feestdagen wel geopend' });
  assert.deepEqual(out.hours[1], { day: 2, label: 'Dinsdag', open: '15:30', close: '20:00', closed: true });
  assert.equal(out.extra, 'blijft');
  assert.ok(!('__orig' in out.hours[0]));
});

test('bestandsnaam, sjablonen en sorteren zoals de menukaart', () => {
  const [g] = normalizeCollections(KB_CONFIG.collections);
  assert.equal(entryId(g, { nummer: 'K12', naam: 'Kanton koe low kai' }), 'k12-kanton-koe-low-kai');
  assert.equal(entryId(g, { nummer: '46A', naam: 'Nasi of bami met ½ kipfilet' }), '46a-nasi-of-bami-met-half-kipfilet');
  assert.equal(fillTemplate('{label}: {open}', { label: 'Ma', open: null }), 'Ma: ');
  const sorted = sortEntries(g, [
    { id: 'b', data: { volgorde: 20, nummer: '2' } },
    { id: 'a', data: { volgorde: 10, nummer: '10' } },
    { id: 'c', data: { volgorde: 10, nummer: '9' } },
  ]);
  assert.deepEqual(sorted.map((e) => e.id), ['c', 'a', 'b']);
  assert.deepEqual(defaultData(g.fields).labels, []);
});

function kbStore(files) {
  const mock = createMockGitHub({ seed: new Map(Object.entries(files)) });
  const client = new GitHubClient({ token: mock.token, owner: mock.owner, repo: mock.repo, branch: mock.branch, fetch: mock.fetch });
  return { mock, client, store: new Store(client, { collections: normalizeCollections(KB_CONFIG.collections) }) };
}

const SEED = {
  'content/gerechten/1-kroepoek.json': '{\n  "nummer": "1",\n  "naam": "Kroepoek",\n  "prijs": 3.5,\n  "categorie": "voorgerechten",\n  "omschrijving": "2 stuks",\n  "labels": [],\n  "volgorde": 10\n}\n',
  'content/categorieen.json': '{"categorieen":[{"id":"voorgerechten","titel":"Voor- en bijgerechten","toelichting":""}]}',
  'content/vakantie.json': '{"vacation":{"from":"","to":""},"notice":""}',
  'README.md': 'hoi',
};

test('Store: collecties laden, gerecht aanpassen = één commit, rest van het bestand onveranderd', async () => {
  const { mock, store } = kbStore(SEED);
  await store.load();
  assert.equal(store.listEntries('gerechten').length, 1);
  assert.equal(store.getEntry('vakantie', 'vakantie').data.notice, '');
  assert.equal(store.dataAt('content/categorieen.json').categorieen[0].id, 'voorgerechten');

  const e = store.getEntry('gerechten', '1-kroepoek');
  await store.saveEntry('gerechten', e.id, { ...e.data, prijs: 3.75 });
  const text = mock.files().get('content/gerechten/1-kroepoek.json').toString();
  assert.equal(text, SEED['content/gerechten/1-kroepoek.json'].replace('3.5', '3.75'));
  assert.equal(mock.log()[0].message.split('\n')[0], 'Gerecht "Kroepoek" aangepast');

  await store.saveEntry('vakantie', 'vakantie', { vacation: { from: '2026-07-01', to: '2026-07-21' }, notice: 'Zomerstop' });
  assert.equal(mock.log()[0].message.split('\n')[0], 'Vakantie en mededeling aangepast');
  assert.equal(JSON.parse(mock.files().get('content/vakantie.json')).notice, 'Zomerstop');
});

test('Store: nieuw gerecht en verwijderen; bestaande naam wordt niet overschreven', async () => {
  const { mock, store } = kbStore(SEED);
  await store.load();
  await store.saveEntry('gerechten', null, { naam: 'Soep', nummer: '22', categorie: 'voorgerechten', labels: [] }, '22-soep');
  assert.ok(mock.files().has('content/gerechten/22-soep.json'));
  assert.equal(mock.log()[0].message.split('\n')[0], 'Gerecht "Soep" toegevoegd');
  await assert.rejects(store.saveEntry('gerechten', null, { naam: 'Kroepoek', nummer: '1' }, '1-kroepoek'), ConflictError);
  await store.deleteEntry('gerechten', '22-soep');
  assert.ok(!mock.files().has('content/gerechten/22-soep.json'));
  assert.equal(mock.log()[0].message.split('\n')[0], 'Gerecht "Soep" verwijderd');
});

test('Store: wijziging door iemand anders wordt niet overschreven', async () => {
  const { mock, store } = kbStore(SEED);
  await store.load();
  mock.externalCommit('content/gerechten/1-kroepoek.json', '{"nummer":"1","naam":"Kroepoek","prijs":4}');
  const e = store.getEntry('gerechten', '1-kroepoek');
  await assert.rejects(store.saveEntry('gerechten', e.id, { ...e.data, prijs: 3.75 }), ConflictError);
  assert.equal(JSON.parse(mock.files().get('content/gerechten/1-kroepoek.json')).prijs, 4);
});

test('uploadTarget: vaste naam of nette naam uit het origineel', async () => {
  const { uploadTarget } = await import('../admin/js/lib/schema.js');
  const f = KB_CONFIG.collections.find((c) => c.name === 'afhaallijst').fields[0];
  assert.deepEqual(uploadTarget(f, 'Nieuwe lijst 2027.PDF'), { path: 'public/assets/docs/afhaallijst.pdf', value: 'assets/docs/afhaallijst.pdf' });
  assert.deepEqual(uploadTarget({ folder: 'docs/' }, 'Menu Été 2027.pdf'), { path: 'docs/menu-ete-2027.pdf', value: 'docs/menu-ete-2027.pdf' });
});

test('Store.saveEntry: geüploade PDF gaat in dezelfde commit mee, overige velden blijven', async () => {
  const overig = { contact: { tel: '0123' }, menuPdf: 'assets/docs/afhaallijst.pdf', menuNote: 'x' };
  const { mock, store } = kbStore({
    'content/overig.json': JSON.stringify(overig, null, 2) + '\n',
    'public/assets/docs/afhaallijst.pdf': '%PDF-oud',
  });
  await store.load();
  const e = store.getEntry('afhaallijst', 'afhaallijst');
  const data = mergeData(store.collection('afhaallijst').fields, e.data, { menuPdf: 'assets/docs/afhaallijst.pdf' });
  const pdf = new TextEncoder().encode('%PDF-1.7 nieuw');
  await store.saveEntry('afhaallijst', e.id, data, null, [{ path: 'public/assets/docs/afhaallijst.pdf', content: pdf }]);
  const files = mock.files();
  assert.equal(files.get('public/assets/docs/afhaallijst.pdf').toString(), '%PDF-1.7 nieuw');
  assert.deepEqual(JSON.parse(files.get('content/overig.json').toString()), overig);
  assert.match(mock.log()[0].message, /Afhaallijst \(PDF\) aangepast \(nieuw bestand: afhaallijst\.pdf\)/);
});

test("vaste pagina's: 'fixed' blijft bewaard en staat altijd online", async () => {
  const { normalizeItem, serializeItem } = await import('../admin/js/lib/content.js');
  const it = normalizeItem('pages', { title: 'Buffet', slug: 'buffet', status: 'draft', fixed: true });
  assert.equal(it.fixed, true);
  assert.equal(it.status, 'published');
  assert.equal(JSON.parse(serializeItem('pages', it)).fixed, true);
  assert.equal('fixed' in normalizeItem('pages', { title: 'Nieuw', slug: 'nieuw' }), false);
});

test("Store: foto's in een eigen map (config media)", async () => {
  const mock = createMockGitHub({ seed: new Map([['public/assets/img/fotos/zaal.jpg', 'x'], ['media/oud.jpg', 'y']]) });
  const client = new GitHubClient({ token: mock.token, owner: mock.owner, repo: mock.repo, branch: mock.branch, fetch: mock.fetch });
  const store = new Store(client, { media: { dir: 'public/assets/img/fotos', url: '/assets/img/fotos' } });
  await store.load();
  assert.deepEqual(store.media().map((m) => m.url), ['/assets/img/fotos/zaal.jpg']);
  const [url] = await store.uploadMedia([{ name: 'Nieuwe Foto.JPG', bytes: new Uint8Array([1, 2]) }]);
  assert.equal(url, '/assets/img/fotos/nieuwe-foto.jpg');
  assert.ok(mock.files().has('public/assets/img/fotos/nieuwe-foto.jpg'));
  assert.equal(store.mediaUrlToPath(url), 'public/assets/img/fotos/nieuwe-foto.jpg');
});

test('mergeData: originele bestandsnaam bij een upload (nameField)', () => {
  const f = [{ name: 'menuPdf', widget: 'file', nameField: 'menuPdfNaam', required: true }];
  const orig = { menuPdf: 'assets/docs/afhaallijst.pdf', contact: { tel: '1' } };
  assert.deepEqual(mergeData(f, orig, { menuPdf: 'assets/docs/afhaallijst.pdf' }), orig);
  assert.deepEqual(mergeData(f, orig, { menuPdf: 'assets/docs/afhaallijst.pdf', menuPdfNaam: 'Afhaallijst dec 2026.pdf' }),
    { ...orig, menuPdfNaam: 'Afhaallijst dec 2026.pdf' });
});
