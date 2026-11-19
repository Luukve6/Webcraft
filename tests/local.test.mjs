import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffFiles, localFetch, isLocalHost, LOCAL_TOKEN } from '../admin/js/local.js';
import { GitHubClient, base64ToBytes, bytesToBase64, utf8ToBytes, bytesToUtf8 } from '../admin/js/lib/github.js';

const enc = (t) => utf8ToBytes(t);

test('isLocalHost: alleen eigen pc', () => {
  assert.equal(isLocalHost('localhost'), true);
  assert.equal(isLocalHost('127.0.0.1'), true);
  assert.equal(isLocalHost('www.example.nl'), false);
  assert.equal(isLocalHost('192.168.1.20'), false);
});

test('diffFiles: alleen gewijzigde, nieuwe en verwijderde bestanden', () => {
  const before = new Map([['a.json', enc('1')], ['b.json', enc('2')], ['c.json', enc('3')]]);
  const after = new Map([['a.json', enc('1')], ['b.json', enc('22')], ['d.json', enc('4')]]);
  const d = diffFiles(before, after);
  assert.deepEqual(Object.keys(d.schrijf).sort(), ['b.json', 'd.json']);
  assert.equal(bytesToUtf8(base64ToBytes(d.schrijf['b.json'])), '22');
  assert.deepEqual(d.verwijder, ['c.json']);
});

/** Nep-webserver (zoals tools/serve.py) die bestanden in een Map bewaart. */
function fakeServer(initial, { fail = false } = {}) {
  const disk = new Map(Object.entries(initial));
  const posts = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u === '/__beheer/bestanden') {
      return new Response(JSON.stringify(Object.fromEntries([...disk].map(([p, t]) => [p, bytesToBase64(enc(t))]))));
    }
    if (u === '/__beheer/opslaan') {
      if (fail) return new Response('schijf vol', { status: 500 });
      const body = JSON.parse(init.body);
      posts.push(body);
      for (const [p, b64] of Object.entries(body.schrijf)) disk.set(p, bytesToUtf8(base64ToBytes(b64)));
      for (const p of body.verwijder) disk.delete(p);
      return new Response('{"ok":true}');
    }
    return realFetch(url, init);
  };
  return { disk, posts, restore: () => { globalThis.fetch = realFetch; } };
}

const config = { repo: { owner: 'x', name: 'site-' + Math.random(), branch: 'main' }, local: { api: '/__beheer' } };

test('localFetch: een opslag in het beheer komt op schijf', async (t) => {
  const srv = fakeServer({ 'content/a.json': '{"prijs":3.5}\n', 'content/b.json': '{}\n' });
  t.after(srv.restore);
  const client = new GitHubClient({ token: LOCAL_TOKEN, owner: 'x', repo: config.repo.name, branch: 'main', fetch: await localFetch(config) });
  await client.commit({
    message: 'test',
    changes: [{ path: 'content/a.json', content: '{"prijs":3.75}\n' }, { path: 'content/b.json', delete: true }],
  });
  assert.equal(srv.disk.get('content/a.json'), '{"prijs":3.75}\n');
  assert.equal(srv.disk.has('content/b.json'), false);
  assert.equal(srv.posts.length, 1);
  assert.deepEqual(Object.keys(srv.posts[0].schrijf), ['content/a.json']);
});

test('onChangeRequired: mislukt het wegschrijven, dan mislukt de opslag en blijft de oude versie', async () => {
  const { createMockGitHub } = await import('../admin/js/lib/mock-github.js');
  const mock = createMockGitHub({
    seed: new Map([['content/a.json', enc('oud')]]),
    onChangeRequired: true,
    onChange: async () => { throw new Error('Opslaan op deze pc mislukt: schijf vol'); },
  });
  const client = new GitHubClient({ token: mock.token, owner: mock.owner, repo: mock.repo, branch: mock.branch, fetch: mock.fetch });
  await assert.rejects(client.commit({ message: 't', changes: [{ path: 'content/a.json', content: 'nieuw' }] }), /schijf vol/);
  assert.equal(bytesToUtf8(mock.files().get('content/a.json')), 'oud');
});
