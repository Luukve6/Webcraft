#!/usr/bin/env node
// Zelftest tegen de échte GitHub API, met precies dezelfde code als /admin.
// Bedoeld om te draaien in GitHub Actions (zie .github/workflows/zelftest.yml)
// op een aparte testbranch. De token komt uit de omgeving en wordt nergens opgeslagen.
//
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=eigenaar/repo CMS_BRANCH=cms-zelftest node scripts/github-selftest.mjs

import { GitHubClient } from '../admin/js/lib/github.js';
import { Store } from '../admin/js/store.js';

const token = process.env.GITHUB_TOKEN;
const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');
const branch = process.env.CMS_BRANCH || 'cms-zelftest';

if (!token || !owner || !repo) {
  console.error('Zet GITHUB_TOKEN, GITHUB_REPOSITORY en CMS_BRANCH.');
  process.exit(2);
}
if (branch === 'main') {
  console.error('Draai de zelftest niet op main.');
  process.exit(2);
}

const client = new GitHubClient({ token, owner, repo, branch });
const steps = [];
const check = (name, ok, detail = '') => {
  steps.push({ stap: name, ok: Boolean(ok), detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' – ' + detail : ''}`);
  if (!ok) throw new Error(`Mislukt: ${name}`);
};

async function fresh() {
  const s = new Store(client);
  await s.load();
  return s;
}

let failed = null;
const runId = process.env.GITHUB_RUN_ID || String(Date.now());
const slug = `zelftest-${runId}`;
try {
  const store = await fresh();
  check('Inhoud laden uit GitHub', store.list('pages').length >= 1, `${store.list('pages').length} pagina's, ${store.list('posts').length} berichten`);

  await store.saveItem('pages', { title: 'Zelftest', slug, status: 'draft', body: '<p>Concept</p><script>alert(1)</script>' }, null);
  let s2 = await fresh();
  check('Pagina aanmaken (concept) = echte commit', s2.get('pages', slug)?.item.status === 'draft', store.head.commitSha);
  check('HTML opgeschoond opgeslagen', !s2.get('pages', slug).item.body.includes('script'));

  await store.saveItem('pages', { ...store.get('pages', slug).item, status: 'published', body: '<p>Online</p>' }, slug);
  s2 = await fresh();
  check('Pagina online zetten', s2.get('pages', slug)?.item.status === 'published');

  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  const [url] = await store.uploadMedia([{ name: `${slug}.png`, bytes: png }]);
  s2 = await fresh();
  const media = s2.media().find((m) => m.url === url);
  check('Foto uploaden (binair bestand)', Boolean(media));
  const bytes = await client.getBlobBytes(media.sha);
  check('Foto komt ongeschonden terug', Buffer.from(bytes).equals(Buffer.from(png)));

  await store.saveItem('pages', { ...store.get('pages', slug).item, slug: `${slug}-nieuw`, body: `<p><img src="${url}" alt=""></p>` }, slug);
  s2 = await fresh();
  check('Pagina hernoemen (oud weg, nieuw erbij, in één commit)', !s2.get('pages', slug) && Boolean(s2.get('pages', `${slug}-nieuw`)));

  await store.deleteItem('pages', `${slug}-nieuw`);
  await store.deleteMedia(url.slice(1));
  s2 = await fresh();
  check('Pagina en foto verwijderen', !s2.get('pages', `${slug}-nieuw`) && !s2.media().some((m) => m.url === url));

  const commits = await client.listCommits(10);
  check('Commitgeschiedenis bevat de wijzigingen', commits.some((c) => c.commit.message.startsWith('Pagina "Zelftest" toegevoegd als concept')));

  let runsOk = true;
  try { await client.listWorkflowRuns({ perPage: 1 }); } catch { runsOk = false; }
  check('Publicatiestatus (Actions) uitleesbaar', runsOk);
  steps.push({ stap: 'GitHub Pages aan', ok: true, detail: String(await client.getPagesEnabled()) });

  // Ter informatie: laatste runs van de publicatie-workflow op main
  try {
    const mainClient = new GitHubClient({ token, owner, repo, branch: 'main' });
    const runs = (await mainClient.listWorkflowRuns({ perPage: 10 })).filter((r) => r.name === 'Website publiceren');
    steps.push({
      stap: 'Publicatie-workflow op main (laatste runs)',
      ok: true,
      detail: runs.slice(0, 3).map((r) => `${r.head_sha.slice(0, 7)}: ${r.status}/${r.conclusion}`).join(', ') || 'geen runs gevonden',
    });
  } catch (e) {
    steps.push({ stap: 'Publicatie-workflow op main (laatste runs)', ok: true, detail: 'niet uitleesbaar: ' + e.message });
  }
} catch (e) {
  failed = e.message;
  console.error(e);
}

// Resultaat vastleggen op de testbranch
const result = { datum: new Date().toISOString(), branch, runId, geslaagd: !failed, fout: failed, stappen: steps };
try {
  await client.commit({ message: `Zelftest ${failed ? 'MISLUKT' : 'geslaagd'} (${runId})`, changes: [{ path: 'zelftest/resultaat.json', content: JSON.stringify(result, null, 2) + '\n' }] });
} catch (e) {
  console.error('Kon resultaat niet opslaan: ' + e.message);
}
console.log(JSON.stringify(result, null, 2));
process.exit(failed ? 1 : 0);
