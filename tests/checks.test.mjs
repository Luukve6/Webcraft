// Controles bij opslaan (uit het testrapport van 19 november 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCollections, validateData, dateWindowText, referenceErrors } from '../admin/js/lib/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(ROOT, 'sites/voorbeeld/config.json'), 'utf8'));
const cols = normalizeCollections(config.collections);
const col = (n) => cols.find((c) => c.name === n);

test('vakantie: laatste dag vóór eerste dag (tikfout in jaartal) wordt geweigerd', () => {
  const e = validateData(col('vakantie').fields, { vacation: { from: '2026-11-19', to: '2006-12-10' }, notice: 'Vakantie' });
  assert.match(e['vacation.to'], /vóór de eerste dag/);
});

test('vakantie: maar één datum ingevuld wordt geweigerd, allebei leeg of allebei gevuld mag', () => {
  const f = col('vakantie').fields;
  assert.match(validateData(f, { vacation: { from: '2026-11-19', to: '' } })['vacation.to'], /laatste dag/);
  assert.match(validateData(f, { vacation: { from: '', to: '2026-12-10' } })['vacation.from'], /eerste dag/);
  assert.deepEqual(validateData(f, { vacation: { from: '', to: '' }, notice: 'Koningsdag' }), {});
  assert.deepEqual(validateData(f, { vacation: { from: '2026-12-01', to: '2026-12-01' } }), {});
});

test('vakantie: het beheer zegt in gewone taal wat er op de website staat', () => {
  const cfg = { from: 'from', to: 'to', showDaysBefore: 21, noun: 'vakantiemelding' };
  const now = new Date('2026-11-19T12:00:00');
  assert.match(dateWindowText(cfg, { from: '', to: '' }, now), /geen vakantiemelding/);
  assert.match(dateWindowText(cfg, { from: '2026-11-19', to: '2006-12-10' }, now), /Kijk het jaartal na/);
  assert.match(dateWindowText(cfg, { from: '2026-10-01', to: '2026-10-05' }, now), /al voorbij/);
  assert.match(dateWindowText(cfg, { from: '2027-04-27', to: '2027-04-27' }, now), /vanaf 6 april 2027/);
  assert.match(dateWindowText(cfg, { from: '2026-12-01', to: '2026-12-05' }, now), /staat nu op de website/);
});

test('openingstijden: open zonder tijden, of dicht vóór open, wordt geweigerd', () => {
  const f = col('openingstijden').fields;
  const base = (day) => ({ hours: [day], holidayHours: { open: '12:00', close: '20:00' }, holidays: [], closedDates: [] });
  let e = validateData(f, base({ day: 4, label: 'Donderdag', closed: false, open: '', close: '' }));
  assert.match(e['hours.0.open'], /vinkje bij Gesloten/);
  e = validateData(f, base({ day: 4, label: 'Donderdag', closed: false, open: '20:00', close: '15:30' }));
  assert.match(e['hours.0.close'], /later zijn dan open/);
  assert.deepEqual(validateData(f, base({ day: 1, label: 'Maandag', closed: true, open: '', close: '' })), {});
  assert.deepEqual(validateData(f, base({ day: 4, label: 'Donderdag', closed: false, open: '15:30', close: '20:00' })), {});
});

test('openingstijden: dezelfde datum twee keer wordt geweigerd', () => {
  const e = validateData(col('openingstijden').fields, {
    hours: [], holidayHours: { open: '12:00', close: '20:00' }, holidays: [], closedDates: ['2026-11-19', '2026-11-19'],
  });
  assert.match(e.closedDates, /19-11-2026 staat er twee keer in/);
});

test('categorieën: weghalen of hernoemen terwijl er nog gerechten in staan wordt geweigerd', () => {
  const c = col('categorieen');
  const store = {
    listEntries: (n) => (n === 'gerechten' ? [{ data: { naam: 'Kipnuggets', categorie: 'kinderen' } }, { data: { naam: 'Frikandel', categorie: 'kinderen' } }, { data: { naam: 'Soep', categorie: 'soepen' } }] : []),
    collection: (n) => col(n),
  };
  const ok = { categorieen: [{ id: 'soepen', titel: 'Soepen' }, { id: 'kinderen', titel: 'Kinderen' }] };
  assert.deepEqual(referenceErrors(c, ok, store, ok), {});
  const removed = { categorieen: [{ id: 'soepen', titel: 'Soepen' }] };
  assert.match(referenceErrors(c, removed, store, ok).categorieen, /"kinderen" \(2\)/);
  const renamed = { categorieen: [{ id: 'soepen', titel: 'Soepen' }, { id: 'kids', titel: 'Kinderen' }] };
  assert.match(referenceErrors(c, renamed, store, ok).categorieen, /"kinderen" \(2\)/);
  // een gerecht dat al eerder los stond (categorie bestond al niet meer) blokkeert andere wijzigingen niet
  const losStore = { ...store, listEntries: () => [{ data: { naam: 'Oud', categorie: 'bestaat-niet' } }] };
  assert.deepEqual(referenceErrors(c, { categorieen: [...ok.categorieen, { id: 'nieuw', titel: 'Nieuw' }] }, losStore, ok), {});
});

test('categorieën: dezelfde korte code twee keer wordt geweigerd', () => {
  const e = validateData(col('categorieen').fields, { categorieen: [{ id: 'soepen', titel: 'Soepen' }, { id: 'soepen', titel: 'Soepen 2' }] });
  assert.match(e.categorieen, /"soepen" staat er twee keer in/);
});
