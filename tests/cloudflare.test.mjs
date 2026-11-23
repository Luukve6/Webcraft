// Opslag in Cloudflare KV (Pages Functions), getest met een nagebootste KV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as opslag from '../cloudflare/functions/_lib/opslag.js';
import { accessEmail } from '../cloudflare/functions/_lib/access.js';
import { onRequest } from '../cloudflare/functions/admin/api/[[route]].js';

function fakeEnv(extra = {}) {
  const m = new Map();
  const kv = {
    async get(k, o) {
      if (!m.has(k)) return null;
      const type = typeof o === 'string' ? o : o && o.type;
      return type === 'json' ? JSON.parse(m.get(k)) : m.get(k);
    },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
  };
  return { WEBCRAFT_DATA: kv, m, ...extra };
}
const b64 = (s) => Buffer.from(s).toString('base64');

test('opslaan, versiecontrole, geschiedenis en terugzetten', async () => {
  const env = fakeEnv();
  const v1 = await opslag.schrijf(env, { schrijf: { 'content/a.json': b64('{"x":1}') } }, 'a@x.nl');
  assert.equal(v1, 1);
  assert.match(env.m.get('inhoud.js'), /"x":1/);
  const v2 = await opslag.schrijf(env, { schrijf: { 'content/a.json': b64('{"x":2}') }, versie: 1 }, 'b@x.nl');
  assert.equal(v2, 2);
  // Verouderde versie: niet over andermans werk heen
  await assert.rejects(opslag.schrijf(env, { schrijf: { 'content/a.json': b64('{"x":3}') }, versie: 1 }, 'a@x.nl'), (e) => e.status === 409);
  const hist = await opslag.geschiedenis(env);
  assert.equal(hist.length, 2);
  assert.equal(hist[0].huidig, true);
  assert.equal(hist[1].email, 'a@x.nl');
  await opslag.terugzetten(env, 1, 'b@x.nl');
  assert.match(env.m.get('inhoud.js'), /"x":1/);
  assert.equal((await opslag.geschiedenis(env)).length, 3);
});

test('alleen inhoud mag worden aangepast; json en pdf worden gecontroleerd', async () => {
  const env = fakeEnv();
  await assert.rejects(opslag.schrijf(env, { schrijf: { 'public/index.html': b64('<x>') } }, 'a@x.nl'), (e) => e.status === 400);
  await assert.rejects(opslag.schrijf(env, { schrijf: { 'content/../geheim.json': b64('{}') } }, 'a@x.nl'), (e) => e.status === 400);
  await assert.rejects(opslag.schrijf(env, { schrijf: { 'content/a.json': b64('{kapot') } }, 'a@x.nl'), (e) => e.status === 400);
  await assert.rejects(opslag.schrijf(env, { schrijf: { 'public/assets/docs/m.pdf': b64('geen pdf') } }, 'a@x.nl'), (e) => e.status === 400);
  await opslag.schrijf(env, { schrijf: { 'public/assets/docs/m.pdf': b64('%PDF-1.4 x') } }, 'a@x.nl');
  assert.ok(env.m.has('bin:/assets/docs/m.pdf'));
  await opslag.schrijf(env, { verwijder: ['public/assets/docs/m.pdf'] }, 'a@x.nl');
  assert.ok(!env.m.has('bin:/assets/docs/m.pdf'));
});

test('eerste gebruiker wordt admin; jezelf buitensluiten kan niet', async () => {
  const env = fakeEnv();
  assert.equal(await opslag.rolVan(env, 'eigenaar@x.nl'), 'admin');
  assert.equal(await opslag.rolVan(env, 'vreemd@x.nl'), null);
  await opslag.bewaarGebruikers(env, [{ email: 'eigenaar@x.nl', rol: 'admin' }, { email: 'Kok@X.nl', rol: 'editor' }], 'eigenaar@x.nl');
  assert.equal(await opslag.rolVan(env, 'kok@x.nl'), 'editor');
  await assert.rejects(opslag.bewaarGebruikers(env, [{ email: 'kok@x.nl', rol: 'admin' }], 'eigenaar@x.nl'), /jezelf/);
  await assert.rejects(opslag.bewaarGebruikers(env, [{ email: 'eigenaar@x.nl', rol: 'baas' }], 'eigenaar@x.nl'), /rol/);
});

test('inloggen: zonder geldig Access-token geen toegang; DEV_EMAIL alleen op localhost', async () => {
  const env = fakeEnv({ DEV_EMAIL: 'dev@x.nl', ACCESS_TEAM: 't.cloudflareaccess.com', ACCESS_AUD: 'aud' });
  assert.equal(await accessEmail(new Request('http://localhost:8788/admin/api/ik'), env), 'dev@x.nl');
  assert.equal(await accessEmail(new Request('https://site.pages.dev/admin/api/ik'), env), null);
  // Een losse e-mailheader is niet genoeg
  const nep = new Request('https://site.pages.dev/admin/api/ik', { headers: { 'Cf-Access-Authenticated-User-Email': 'a@x.nl', 'Cf-Access-Jwt-Assertion': 'a.b.c' } });
  assert.equal(await accessEmail(nep, env), null);
});

test('API: rollen en JSON-verplichting', async () => {
  const env = fakeEnv({ DEV_EMAIL: 'eigenaar@x.nl' });
  const call = (route, init = {}, email) => onRequest({ request: new Request(`http://localhost/admin/api/${route}`, init), env: email ? { ...env, DEV_EMAIL: email } : env, params: { route: route.split('/') } });
  assert.deepEqual(await (await call('ik')).json(), { email: 'eigenaar@x.nl', rol: 'admin' });
  const post = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await call('gebruikers', post({ gebruikers: [{ email: 'eigenaar@x.nl', rol: 'admin' }, { email: 'kok@x.nl', rol: 'editor' }] }))).status, 200);
  assert.equal((await call('gebruikers', {}, 'kok@x.nl')).status, 403);
  assert.equal((await call('ik', {}, 'vreemd@x.nl')).status, 403);
  assert.equal((await call('opslaan', { method: 'POST', body: '{}' })).status, 415);
  const r = await call('opslaan', post({ schrijf: { 'content/a.json': b64('{}') } }), 'kok@x.nl');
  assert.equal((await r.json()).versie, 1);
  const files = await call('bestanden');
  assert.equal(files.headers.get('X-Webcraft-Versie'), '1');
});
