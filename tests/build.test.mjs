import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, render, withBasePath, normalizeBasePath } from '../scripts/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function project(files) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cms-build-'));
  for (const d of ['templates', 'static', 'admin']) await cp(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  for (const [p, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, p)), { recursive: true });
    await writeFile(path.join(dir, p), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

const page = (slug, extra = {}) => ({ title: slug.toUpperCase(), slug, status: 'published', body: `<p>${slug}</p>`, inMenu: true, menuOrder: 1, ...extra });
const post = (slug, date, extra = {}) => ({ title: `Bericht ${slug}`, slug, status: 'published', body: `<p>${slug}</p>`, date, ...extra });

test('template-functies', () => {
  assert.equal(render('{{a.b}}|{{{c}}}', { a: { b: '<x>' }, c: '<y>' }), '&lt;x&gt;|<y>');
  assert.equal(
    withBasePath('<a href="/over/">x</a><img src="/media/a.jpg"><a href="//cdn">y</a><a href="https://x">z</a>', '/repo'),
    '<a href="/repo/over/">x</a><img src="/repo/media/a.jpg"><a href="//cdn">y</a><a href="https://x">z</a>');
  assert.equal(normalizeBasePath('/'), '');
  assert.equal(normalizeBasePath('repo/'), '/repo');
});

test('bouwt pagina\'s, berichten, menu, 404 en sitemap; concepten blijven weg', async () => {
  const dir = await project({
    'content/site.json': { title: 'Testsite', homepage: 'home', url: 'https://voorbeeld.nl', postsOnHome: 2, blogTitle: 'Nieuws' },
    'content/pages/home.json': page('home', { menuOrder: 0 }),
    'content/pages/over.json': page('over', { body: '<p>Over <a href="/contact/">contact</a></p><script>alert(1)</script><img src="x" onerror="alert(1)">' }),
    'content/pages/geheim.json': page('geheim', { status: 'draft' }),
    'content/posts/oud.json': post('oud', '2026-01-01'),
    'content/posts/nieuw.json': post('nieuw', '2026-06-01', { image: '/media/foto.jpg' }),
    'content/posts/concept.json': post('concept', '2026-07-01', { status: 'draft' }),
    'media/foto.jpg': 'jpgdata',
  });
  const out = path.join(dir, '_site');
  const r = await build({ root: dir, out, basePath: '', quiet: true });
  assert.equal(r.pages.length, 2);
  assert.equal(r.posts.length, 2);
  const home = await readFile(path.join(out, 'index.html'), 'utf8');
  assert.match(home, /<title>Testsite<\/title>/);
  assert.ok(home.indexOf('Bericht nieuw') < home.indexOf('Bericht oud'), 'nieuwste bericht eerst');
  assert.match(home, /<a href="\/over\/">OVER<\/a>/);
  assert.ok(!home.includes('GEHEIM'), 'concept niet in menu');
  const over = await readFile(path.join(out, 'over/index.html'), 'utf8');
  assert.ok(!over.includes('<script>alert'), 'script verwijderd');
  assert.ok(!over.includes('onerror'), 'event handler verwijderd');
  assert.match(over, /aria-current="page">OVER/);
  assert.equal(existsSync(path.join(out, 'geheim/index.html')), false);
  assert.equal(existsSync(path.join(out, 'blog/concept/index.html')), false);
  assert.ok(existsSync(path.join(out, 'blog/nieuw/index.html')));
  assert.ok(existsSync(path.join(out, 'blog/index.html')));
  assert.ok(existsSync(path.join(out, 'media/foto.jpg')));
  assert.ok(existsSync(path.join(out, 'admin/index.html')), 'beheer wordt meegekopieerd naar /admin');
  assert.ok(existsSync(path.join(out, 'assets/site.css')));
  assert.ok(existsSync(path.join(out, '404.html')));
  assert.ok(existsSync(path.join(out, '.nojekyll')));
  const sitemap = await readFile(path.join(out, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /https:\/\/voorbeeld\.nl\/over\//);
  assert.ok(!sitemap.includes('geheim'));
  await rm(dir, { recursive: true, force: true });
});

test('basispad voor GitHub Pages-projectsites', async () => {
  const dir = await project({
    'content/site.json': { title: 'T', homepage: 'home' },
    'content/pages/home.json': page('home', { body: '<p><a href="/over/">over</a><img src="/media/a.jpg" alt=""></p>' }),
    'content/pages/over.json': page('over'),
  });
  const out = path.join(dir, '_site');
  await build({ root: dir, out, basePath: '/webcraft', quiet: true });
  const home = await readFile(path.join(out, 'index.html'), 'utf8');
  assert.match(home, /href="\/webcraft\/assets\/site\.css"/);
  assert.match(home, /href="\/webcraft\/over\/"/);
  assert.match(home, /src="\/webcraft\/media\/a\.jpg"/);
  await rm(dir, { recursive: true, force: true });
});

test('zonder homepagina wordt het berichtenoverzicht de startpagina', async () => {
  const dir = await project({ 'content/site.json': { title: 'T', homepage: '' }, 'content/posts/a.json': post('a', '2026-01-01') });
  const out = path.join(dir, '_site');
  await build({ root: dir, out, quiet: true });
  assert.match(await readFile(path.join(out, 'index.html'), 'utf8'), /Bericht a/);
  await rm(dir, { recursive: true, force: true });
});

test('duidelijke fout bij gereserveerd adres of verkeerde bestandsnaam', async () => {
  const d1 = await project({ 'content/pages/admin.json': page('admin') });
  await assert.rejects(build({ root: d1, out: path.join(d1, '_site'), quiet: true }), /gereserveerd/);
  const d2 = await project({ 'content/pages/a.json': page('b') });
  await assert.rejects(build({ root: d2, out: path.join(d2, '_site'), quiet: true }), /bestandsnaam/);
  await rm(d1, { recursive: true, force: true });
  await rm(d2, { recursive: true, force: true });
});

test('de echte inhoud van deze repository bouwt zonder fouten', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'cms-real-'));
  const r = await build({ root: ROOT, out, quiet: true });
  assert.ok(r.pages.length >= 1);
  await rm(out, { recursive: true, force: true });
});
