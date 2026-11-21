// Contactgegevens en sociale media uit Instellingen (content/site.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneHref, normalizePostcode, normalizeWebUrl, isEmail, directionsHref, normalizeSite } from '../admin/js/lib/content.js';
import { contactHtml } from '../scripts/build.mjs';

test('phoneHref maakt een bel-link van een Nederlands nummer', () => {
  assert.equal(phoneHref('0318 12 34 56'), 'tel:+31318123456');
  assert.equal(phoneHref('06-12345678'), 'tel:+31612345678');
  assert.equal(phoneHref('+31 (0)318 123456'.replace('(0)', '')), 'tel:+31318123456');
  assert.equal(phoneHref('0031 318 123456'), 'tel:+31318123456');
  assert.equal(phoneHref('bel ons'), '');
  assert.equal(phoneHref('123'), '');
});

test('normalizePostcode zet een postcode netjes', () => {
  assert.equal(normalizePostcode('1234ab'), '1234 AB');
  assert.equal(normalizePostcode(' 1234  Ab '), '1234 AB');
  assert.equal(normalizePostcode('B-2000'), 'B-2000');
});

test('normalizeWebUrl accepteert adressen zonder https://', () => {
  assert.equal(normalizeWebUrl('facebook.com/mijnzaak', 'facebook.com'), 'https://facebook.com/mijnzaak');
  assert.equal(normalizeWebUrl('https://www.facebook.com/mijnzaak', 'facebook.com'), 'https://www.facebook.com/mijnzaak');
  assert.equal(normalizeWebUrl('www.mijnsite.nl'), 'https://www.mijnsite.nl/');
  assert.equal(normalizeWebUrl(''), '');
  assert.equal(normalizeWebUrl('instagram.com/zaak', 'facebook.com'), null);
  assert.equal(normalizeWebUrl('javascript:alert(1)'), null);
  assert.equal(normalizeWebUrl('mijnzaak'), null);
  assert.equal(normalizeWebUrl('evilfacebook.com/x', 'facebook.com'), null);
});

test('isEmail', () => {
  assert.ok(isEmail('info@mijnzaak.nl'));
  assert.ok(!isEmail('info@mijnzaak'));
  assert.ok(!isEmail('info mijnzaak.nl'));
});

test('directionsHref alleen met straat en plaats', () => {
  assert.match(directionsHref({ address: 'Dorpsstraat 12', postcode: '1234 AB', city: 'Ergens' }), /destination=Dorpsstraat%2012%2C%201234%20AB%20Ergens$/);
  assert.equal(directionsHref({ address: '', city: 'Ergens' }), '');
});

test('normalizeSite neemt het oude telefoonveld over en gooit afgeleide velden weg', () => {
  const s = normalizeSite({ phoneDisplay: '0318 12 34 56', phoneLink: '+31318123456', mapsUrl: 'x', directionsUrl: 'y' });
  assert.equal(s.phone, '0318 12 34 56');
  assert.ok(!('phoneLink' in s) && !('mapsUrl' in s) && !('directionsUrl' in s) && !('phoneDisplay' in s));
});

test('contactHtml: leeg zonder gegevens, anders adres, bellen, mail en sociale media', () => {
  assert.equal(contactHtml(normalizeSite({})), '');
  const html = contactHtml(normalizeSite({
    address: 'Dorpsstraat 12', postcode: '1234 AB', city: 'Ergens', phone: '0318 12 34 56', email: 'info@zaak.nl',
    facebook: 'https://facebook.com/zaak', instagram: 'javascript:alert(1)',
  }));
  assert.match(html, /Dorpsstraat 12<br>1234 AB Ergens/);
  assert.match(html, /href="tel:\+31318123456">0318 12 34 56</);
  assert.match(html, /href="mailto:info@zaak\.nl"/);
  assert.match(html, /href="https:\/\/facebook\.com\/zaak"/);
  assert.match(html, /Route plannen/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /Instagram/);
});

test('contactHtml ontsnapt HTML in de velden', () => {
  const html = contactHtml(normalizeSite({ address: '<script>x</script>', city: 'A&B' }));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /A&amp;B/);
});
