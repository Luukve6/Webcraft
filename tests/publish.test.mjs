import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PublishTracker } from '../admin/js/publish.js';
import { sha1 } from '../admin/js/lib/mock-github.js';

function fakeClient(run) {
  return { listWorkflowRuns: async () => (run ? [run] : []) };
}

async function finalState(hosting, run, pagesEnabled = null) {
  const t = new PublishTracker(fakeClient(run), { hosting });
  t.pagesEnabled = pagesEnabled;
  t.track('abc');
  await new Promise((r) => setTimeout(r, 10));
  t.stop();
  return t.state;
}

const done = (conclusion) => ({ name: 'Website publiceren', status: 'completed', conclusion, head_sha: 'abc' });

test('GitHub Pages: geslaagde run = online, Pages uit = waarschuwing', async () => {
  assert.equal(await finalState('github-pages', done('success'), true), 'live');
  assert.equal(await finalState('github-pages', done('success'), false), 'noPages');
  assert.equal(await finalState('github-pages', done('failure'), true), 'failed');
});

test('Cloudflare: geslaagde controle = doorgegeven aan Cloudflare, geen Pages-waarschuwing', async () => {
  assert.equal(await finalState('cloudflare', done('success'), false), 'handedOff');
  assert.equal(await finalState('cloudflare', done('skipped'), false), 'handedOff');
  assert.equal(await finalState('cloudflare', done('failure'), false), 'failed');
});

test('Cloudflare zonder leesrechten voor Actions: toch "opgeslagen, Cloudflare zet het online"', async () => {
  const client = { listWorkflowRuns: async () => { const e = new Error('nee'); e.status = 403; throw e; } };
  const t = new PublishTracker(client, { hosting: 'cloudflare' });
  t.track('abc');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(t.state, 'handedOff');
});

test('eigen SHA-1 (demo in de browser) is gelijk aan die van Node', () => {
  for (const s of ['', 'abc', 'x'.repeat(5000), 'é€ – 😀']) {
    assert.equal(sha1(s), createHash('sha1').update(s).digest('hex'));
  }
  const bytes = new Uint8Array(1000).map((_, i) => (i * 7) % 256);
  assert.equal(sha1(bytes), createHash('sha1').update(bytes).digest('hex'));
});
