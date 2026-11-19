// Test de GitHub-koppeling tegen de nagebootste GitHub API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClient, ConflictError, GitHubError } from '../admin/js/lib/github.js';
import { createMockGitHub } from '../scripts/mock-github.mjs';

function setup(opts = {}) {
  const mock = createMockGitHub({ seed: new Map([['content/pages/home.json', Buffer.from('{"title":"Home","slug":"home"}')], ['README.md', Buffer.from('hoi')]]), ...opts });
  const client = new GitHubClient({ token: mock.token, owner: mock.owner, repo: mock.repo, branch: mock.branch, apiBase: 'http://mock/__mock_github', fetch: mock.fetch });
  return { mock, client };
}

test('controleert toegang en schrijfrechten', async () => {
  const { client } = setup();
  const { user, canWrite } = await client.checkAccess();
  assert.equal(user.login, 'testgebruiker');
  assert.equal(canWrite, true);
  const ro = setup({ canWrite: false });
  assert.equal((await ro.client.checkAccess()).canWrite, false);
});

test('ongeldige token geeft duidelijke 401-fout', async () => {
  const { mock } = setup();
  const bad = new GitHubClient({ token: 'fout', owner: mock.owner, repo: mock.repo, apiBase: 'http://mock/__mock_github', fetch: mock.fetch });
  await assert.rejects(bad.getUser(), (e) => e instanceof GitHubError && e.status === 401 && /opnieuw in/.test(e.message));
});

test('leest bestanden via tree en blobs', async () => {
  const { client } = setup();
  const head = await client.getHead();
  const { files } = await client.getTree(head.treeSha);
  assert.ok(files.has('content/pages/home.json'));
  assert.equal(await client.getBlobText(files.get('README.md').sha), 'hoi');
});

test('maakt een commit met meerdere bestanden (tekst + binair) en verwijdering', async () => {
  const { mock, client } = setup();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255, 128, 7]);
  const r = await client.commit({
    message: 'Test',
    changes: [
      { path: 'content/pages/nieuw.json', content: '{"title":"Nieuw – é"}' },
      { path: 'media/foto.png', content: png },
      { path: 'README.md', delete: true },
    ],
    expected: { 'content/pages/nieuw.json': null },
  });
  const files = mock.files();
  assert.equal(files.get('content/pages/nieuw.json').toString('utf8'), '{"title":"Nieuw – é"}');
  assert.deepEqual([...files.get('media/foto.png')], [...png]);
  assert.equal(files.has('README.md'), false);
  assert.equal(mock.log()[0].message, 'Test');
  assert.equal(mock.log()[0].sha, r.commitSha);
  assert.equal(r.shas['README.md'], null);
});

test('conflict als iemand anders het bestand intussen wijzigde', async () => {
  const { mock, client } = setup();
  const head = await client.getHead();
  const { files } = await client.getTree(head.treeSha);
  const sha = files.get('content/pages/home.json').sha;
  mock.externalCommit('content/pages/home.json', '{"title":"Anders"}');
  await assert.rejects(
    client.commit({ message: 'mijn wijziging', changes: [{ path: 'content/pages/home.json', content: '{}' }], expected: { 'content/pages/home.json': sha } }),
    (e) => e instanceof ConflictError && e.paths[0] === 'content/pages/home.json');
  assert.equal(mock.files().get('content/pages/home.json').toString(), '{"title":"Anders"}', 'wijziging van de ander blijft staan');
});

test('conflict als een nieuw adres al bestaat', async () => {
  const { client } = setup();
  await assert.rejects(client.commit({ message: 'x', changes: [{ path: 'content/pages/home.json', content: '{}' }], expected: { 'content/pages/home.json': null } }), ConflictError);
});

test('wijziging van iemand anders aan een ánder bestand blijft behouden (geen overschrijven)', async () => {
  const { mock, client } = setup();
  await client.getHead();
  mock.externalCommit('content/pages/ander.json', '{"x":1}');
  await client.commit({ message: 'mijn', changes: [{ path: 'content/pages/mijn.json', content: '{}' }], expected: { 'content/pages/mijn.json': null } });
  const files = mock.files();
  assert.ok(files.has('content/pages/ander.json'));
  assert.ok(files.has('content/pages/mijn.json'));
});

test('probeert opnieuw als de branch tijdens het opslaan verandert', async () => {
  const { mock, client } = setup();
  let raced = false;
  const origFetch = client.fetch;
  client.fetch = async (url, init = {}) => {
    if (!raced && init.method === 'PATCH') { raced = true; mock.externalCommit('content/pages/race.json', '{}'); }
    return origFetch(url, init);
  };
  await client.commit({ message: 'na race', changes: [{ path: 'content/pages/b.json', content: '{}' }] });
  assert.ok(raced);
  const files = mock.files();
  assert.ok(files.has('content/pages/race.json') && files.has('content/pages/b.json'));
  assert.equal(mock.log()[0].message, 'na race');
});

test('zonder schrijfrechten mislukt opslaan met 403', async () => {
  const { client } = setup({ canWrite: false });
  await assert.rejects(client.commit({ message: 'x', changes: [{ path: 'a.txt', content: 'a' }] }), (e) => e.status === 403);
});

test('publicatiestatus en Pages-controle', async () => {
  const { client } = setup();
  const r = await client.commit({ message: 'x', changes: [{ path: 'a.txt', content: 'a' }] });
  const runs = await client.listWorkflowRuns({ headSha: r.commitSha });
  assert.equal(runs[0].head_sha, r.commitSha);
  assert.equal(await client.getPagesEnabled(), true);
  assert.equal(await setup({ pagesEnabled: false }).client.getPagesEnabled(), false);
});
