import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, validateItem, normalizeItem, serializeItem, parseItem, formatDateNl, normalizeSite } from '../admin/js/lib/content.js';

test('slugify maakt nette adressen', () => {
  assert.equal(slugify('Over ons'), 'over-ons');
  assert.equal(slugify('  Café & Terras!  '), 'cafe-en-terras');
  assert.equal(slugify('Één, twee… drie?'), 'een-twee-drie');
  assert.equal(slugify('---'), '');
  assert.ok(slugify('a'.repeat(200)).length <= 80);
});

test('validateItem geeft Nederlandse foutmeldingen', () => {
  assert.deepEqual(validateItem('pages', { title: 'Over ons', slug: 'over-ons' }), {});
  assert.match(validateItem('pages', { title: '', slug: 'x' }).title, /titel/);
  assert.match(validateItem('pages', { title: 'A', slug: 'Over Ons' }).slug, /kleine letters/);
  assert.match(validateItem('pages', { title: 'A', slug: 'admin' }).slug, /gereserveerd/);
  assert.match(validateItem('pages', { title: 'A', slug: 'contact' }, ['contact']).slug, /bestaat al/);
  assert.equal(validateItem('posts', { title: 'A', slug: 'admin' }).slug, undefined, 'berichten staan onder /blog/, dus admin mag');
  assert.match(validateItem('posts', { title: 'A', slug: 'a', date: '19-11-2026' }).date, /datum/);
});

test('normalizeItem en serialize/parse zijn elkaars omgekeerde', () => {
  const item = normalizeItem('posts', { title: 'T', slug: 't', status: 'published', body: '<p>x</p>', date: '2026-01-02' });
  const back = parseItem('posts', serializeItem('posts', item));
  assert.deepEqual(back, item);
  assert.equal(normalizeItem('pages', { status: 'iets' }).status, 'draft');
});

test('parseItem geeft duidelijke fout bij kapotte JSON', () => {
  assert.throws(() => parseItem('pages', '{kapot', 'content/pages/x.json'), /content\/pages\/x\.json/);
});

test('formatDateNl', () => {
  assert.equal(formatDateNl('2026-11-19'), '19 november 2026');
  assert.equal(formatDateNl('onzin'), '');
});

test('normalizeSite begrenst waarden', () => {
  assert.equal(normalizeSite({ postsOnHome: 99 }).postsOnHome, 20);
  assert.equal(normalizeSite({}).title, 'Mijn website');
});
