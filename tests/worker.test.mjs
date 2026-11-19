// Test van de OAuth-tussenschakel (Cloudflare Worker) zonder echte GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/oauth-worker.js';

const env = { GITHUB_CLIENT_ID: 'test-client-id', GITHUB_CLIENT_SECRET: 'test-geheim', ALLOWED_ORIGINS: 'https://site.example, http://localhost:8080' };
const W = 'https://auth.example.workers.dev';

test('zonder instellingen geeft de worker een duidelijke fout', async () => {
  const r = await worker.fetch(new Request(`${W}/auth?origin=https://site.example`), {});
  assert.equal(r.status, 500);
  assert.match(await r.text(), /nog niet ingesteld/);
});

test('/auth weigert onbekende websites', async () => {
  const r = await worker.fetch(new Request(`${W}/auth?origin=https://kwaadwillend.example`), env);
  assert.equal(r.status, 403);
});

test('/auth stuurt door naar GitHub met state-cookie', async () => {
  const r = await worker.fetch(new Request(`${W}/auth?origin=https://site.example`), env);
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get('Location'));
  assert.equal(loc.origin + loc.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(loc.searchParams.get('client_id'), 'test-client-id');
  assert.equal(loc.searchParams.get('redirect_uri'), `${W}/callback`);
  assert.equal(loc.searchParams.get('scope'), null, 'GitHub App: geen scope, de app bepaalt de rechten');
  assert.ok(!loc.href.includes('test-geheim'), 'secret mag nooit in de URL');
  const cookie = r.headers.get('Set-Cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.ok(cookie.includes(encodeURIComponent(loc.searchParams.get('state') + '|https://site.example')));
});

test('/auth met OAUTH_SCOPE (gewone OAuth App) vraagt die scope', async () => {
  const r = await worker.fetch(new Request(`${W}/auth?origin=https://site.example`), { ...env, OAUTH_SCOPE: 'repo' });
  assert.equal(new URL(r.headers.get('Location')).searchParams.get('scope'), 'repo');
});

async function startLogin() {
  const r = await worker.fetch(new Request(`${W}/auth?origin=https://site.example`), env);
  const state = new URL(r.headers.get('Location')).searchParams.get('state');
  const cookie = r.headers.get('Set-Cookie').split(';')[0];
  return { state, cookie };
}

test('/callback wisselt de code om en stuurt de token alleen naar de eigen website', async () => {
  const { state, cookie } = await startLogin();
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ access_token: 'gho_testtoken</script>', token_type: 'bearer' }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const r = await worker.fetch(new Request(`${W}/callback?code=abc&state=${state}`, { headers: { Cookie: cookie } }), env);
    assert.equal(r.status, 200);
    assert.equal(sent.url, 'https://github.com/login/oauth/access_token');
    assert.equal(sent.body.client_secret, 'test-geheim');
    assert.equal(sent.body.code, 'abc');
    const html = await r.text();
    assert.match(html, /postMessage\(data, target\)/);
    assert.match(html, /"https:\/\/site\.example"/);
    assert.ok(!html.includes('</script>"'), 'token kan niet uit de script-tag breken');
    assert.ok(html.includes('gho_testtoken\\u003c/script\\u003e'));
    assert.ok(!html.includes('test-geheim'), 'secret komt nooit in de pagina');
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('/callback weigert verkeerde state (CSRF-bescherming)', async () => {
  const { cookie } = await startLogin();
  const r = await worker.fetch(new Request(`${W}/callback?code=abc&state=verkeerd`, { headers: { Cookie: cookie } }), env);
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Beveiligingscontrole mislukt/);
});

test('/callback zonder cookie wordt geweigerd', async () => {
  const r = await worker.fetch(new Request(`${W}/callback?code=abc&state=x`), env);
  assert.equal(r.status, 400);
});
