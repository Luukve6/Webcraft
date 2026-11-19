// Volledige keten: beheer (Store) -> commits in (nagebootste) GitHub -> build -> website.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitHubClient } from '../admin/js/lib/github.js';
import { Store } from '../admin/js/store.js';
import { createMockGitHub } from '../scripts/mock-github.mjs';
import { build } from '../scripts/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function seedFrom(dir, out = new Map()) {
  for (const e of await readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) await seedFrom(rel, out);
    else out.set(rel, await readFile(path.join(ROOT, rel)));
  }
  return out;
}

test('aanmaken, bewerken, hernoemen, verwijderen, foto en instellingen komen als commits in GitHub en op de website', async () => {
  const mock = createMockGitHub({ seed: await seedFrom('content') });
  const client = new GitHubClient({ token: mock.token, owner: mock.owner, repo: mock.repo, apiBase: 'http://mock', fetch: mock.fetch });
  const store = new Store(client);
  await store.load();
  assert.ok(store.list('pages').length >= 1);

  // 1. Nieuwe pagina als concept
  await store.saveItem('pages', { title: 'Menukaart', slug: 'menukaart', status: 'draft', body: '<p>Soep</p><script>x</script>', inMenu: true, menuOrder: 5 }, null);
  // 2. Online zetten
  await store.saveItem('pages', { ...store.get('pages', 'menukaart').item, status: 'published' }, 'menukaart');
  // 3. Foto uploaden
  const [url] = await store.uploadMedia([{ name: 'Mijn Foto.JPG', bytes: new Uint8Array([1, 2, 3]) }]);
  assert.equal(url, '/media/mijn-foto.jpg');
  // 4. Hernoemen + tekst met foto
  await store.saveItem('pages', { ...store.get('pages', 'menukaart').item, slug: 'kaart', body: `<p>Soep en <img src="${url}" alt="foto"></p>` }, 'menukaart');
  // 5. Bericht aanmaken en weer verwijderen
  await store.saveItem('posts', { title: 'Tijdelijk', slug: 'tijdelijk', status: 'published', body: '<p>x</p>', date: '2026-11-19' }, null);
  await store.deleteItem('posts', 'tijdelijk');
  // 6. Instellingen
  await store.saveSite({ ...store.site, title: 'Restaurant Test' });

  const messages = mock.log().map((c) => c.message.split('\n')[0]);
  assert.deepEqual(messages.slice(0, 7), [
    'Instellingen van de website bijgewerkt',
    'Bericht "Tijdelijk" verwijderd',
    'Bericht "Tijdelijk" toegevoegd en online gezet',
    'Pagina "Menukaart" bijgewerkt (adres gewijzigd: menukaart → kaart)',
    'Foto toegevoegd: mijn-foto.jpg',
    'Pagina "Menukaart" online gezet',
    'Pagina "Menukaart" toegevoegd als concept',
  ]);

  const files = mock.files();
  assert.equal(files.has('content/pages/menukaart.json'), false);
  assert.equal(files.has('content/posts/tijdelijk.json'), false);
  const kaart = JSON.parse(files.get('content/pages/kaart.json').toString());
  assert.equal(kaart.status, 'published');
  assert.ok(!kaart.body.includes('script'), 'opgeschoond bij opslaan');

  // Een tweede beheerder die nu laadt, ziet alles
  const store2 = new Store(client);
  await store2.load();
  assert.equal(store2.get('pages', 'kaart').item.title, 'Menukaart');
  assert.equal(store2.site.title, 'Restaurant Test');
  assert.equal(store2.media().length, 1);

  // Website bouwen van de inhoud zoals die nu in "GitHub" staat
  const dir = await mkdtemp(path.join(tmpdir(), 'cms-flow-'));
  for (const d of ['templates', 'static', 'admin']) await cp(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  for (const [p, buf] of files) {
    await mkdir(path.dirname(path.join(dir, p)), { recursive: true });
    await writeFile(path.join(dir, p), buf);
  }
  await build({ root: dir, out: path.join(dir, '_site'), quiet: true });
  const html = await readFile(path.join(dir, '_site/kaart/index.html'), 'utf8');
  assert.match(html, /Restaurant Test/);
  assert.match(html, /<img src="\/media\/mijn-foto\.jpg" alt="foto">/);
  assert.ok(existsSync(path.join(dir, '_site/media/mijn-foto.jpg')));
  assert.equal(existsSync(path.join(dir, '_site/menukaart/index.html')), false);
  await rm(dir, { recursive: true, force: true });
});
