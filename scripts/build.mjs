#!/usr/bin/env node
// Maakt de statische website in de map _site/.
//
//   content/site.json        -> algemene instellingen
//   content/pages/*.json     -> pagina's   (/adres/)
//   content/posts/*.json     -> berichten  (/blog/adres/)
//   media/                   -> foto's     (/media/...)
//   static/                  -> vaste bestanden van je eigen site (worden 1-op-1 gekopieerd)
//   admin/                   -> de beheeromgeving (/admin/)
//   templates/*.html         -> opmaak van de pagina's
//
// Alleen items met status "published" komen op de website. Concepten niet.
//
// Omgevingsvariabelen:
//   BASE_PATH  bijv. "/webcraft" als de site op https://gebruiker.github.io/webcraft/ staat
//   SITE_URL   volledige adres van de site (voor sitemap.xml), optioneel

import { readFile, writeFile, mkdir, readdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeHtml, escapeHtml, htmlToText } from '../admin/js/lib/sanitize.js';
import { parseItem, normalizeSite, formatDateNl, RESERVED_SLUGS, STATUS } from '../admin/js/lib/content.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Mini-templatetaal: {{x.y}} wordt veilig ingevuld, {{{x}}} als ruwe HTML. */
export function render(tpl, data) {
  const get = (key) => key.trim().split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
  return tpl
    .replace(/\{\{\{([^}]+)\}\}\}/g, (_, k) => String(get(k) ?? ''))
    .replace(/\{\{([^}]+)\}\}/g, (_, k) => escapeHtml(get(k) ?? ''));
}

/** Zet adressen die met "/" beginnen om naar BASE_PATH + adres. */
export function withBasePath(html, basePath) {
  if (!basePath) return html;
  return html.replace(/(\s(?:href|src)=")\/(?!\/)/g, `$1${basePath}/`);
}

export function normalizeBasePath(p) {
  if (!p) return '';
  let v = String(p).trim();
  if (v === '/' || v === '') return '';
  if (!v.startsWith('/')) v = '/' + v;
  return v.replace(/\/+$/, '');
}

async function readJsonDir(dir, type) {
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  const items = [];
  for (const name of names) {
    const rel = path.posix.join(type === 'pages' ? 'content/pages' : 'content/posts', name);
    const item = parseItem(type, await readFile(path.join(dir, name), 'utf8'), rel);
    const fileSlug = name.replace(/\.json$/, '');
    if (item.slug !== fileSlug) {
      throw new Error(`${rel}: het adres in het bestand ("${item.slug}") komt niet overeen met de bestandsnaam ("${fileSlug}").`);
    }
    items.push(item);
  }
  return items;
}

async function writeOut(out, rel, content) {
  const file = path.join(out, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

export async function build({ root = ROOT, out = path.join(root, '_site'), basePath = process.env.BASE_PATH, siteUrl = process.env.SITE_URL, quiet = false } = {}) {
  const bp = normalizeBasePath(basePath);
  const log = quiet ? () => {} : (...a) => console.log(...a);

  const siteFile = path.join(root, 'content/site.json');
  const site = normalizeSite(existsSync(siteFile) ? JSON.parse(await readFile(siteFile, 'utf8')) : {});
  const url = (siteUrl || site.url || '').replace(/\/$/, '');

  const allPages = await readJsonDir(path.join(root, 'content/pages'), 'pages');
  const allPosts = await readJsonDir(path.join(root, 'content/posts'), 'posts');

  for (const p of allPages) {
    if (RESERVED_SLUGS.has(p.slug)) throw new Error(`content/pages/${p.slug}.json: het adres "${p.slug}" is gereserveerd.`);
  }

  const pages = allPages.filter((p) => p.status === STATUS.PUBLISHED);
  const posts = allPosts.filter((p) => p.status === STATUS.PUBLISHED).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const tpl = {};
  for (const name of ['layout', 'page', 'post', 'post-card', 'blog', '404']) {
    tpl[name] = await readFile(path.join(root, 'templates', `${name}.html`), 'utf8');
  }

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  // Vaste bestanden, media en beheeromgeving kopiëren
  for (const dir of ['static', 'media', 'admin']) {
    const src = path.join(root, dir);
    if (!existsSync(src)) continue;
    const dest = dir === 'static' ? out : path.join(out, dir);
    await cp(src, dest, { recursive: true, filter: (f) => !path.basename(f).startsWith('.') || path.basename(f) === '.nojekyll' });
  }
  await writeFile(path.join(out, '.nojekyll'), '');

  const homeSlug = site.homepage;
  const pageUrl = (slug) => (slug === homeSlug ? `${bp}/` : `${bp}/${slug}/`);
  const postUrl = (slug) => `${bp}/blog/${slug}/`;
  const mediaUrl = (src) => (src.startsWith('/') ? bp + src : src);

  // Menu
  const menuItems = pages
    .filter((p) => p.inMenu)
    .sort((a, b) => a.menuOrder - b.menuOrder || a.title.localeCompare(b.title, 'nl'))
    .map((p) => ({ href: pageUrl(p.slug), label: p.title, key: p.slug }));
  if (site.showBlogInMenu && posts.length) menuItems.push({ href: `${bp}/blog/`, label: site.blogTitle || 'Nieuws', key: '__blog' });
  const menu = (activeKey) =>
    menuItems.length
      ? '<ul>' + menuItems.map((m) => `<li><a href="${escapeHtml(m.href)}"${m.key === activeKey ? ' aria-current="page"' : ''}>${escapeHtml(m.label)}</a></li>`).join('') + '</ul>'
      : '';

  const footer = site.footer || `© ${new Date().getFullYear()} ${site.title}`;
  const layout = (data) =>
    render(tpl.layout, {
      site, basePath: bp, footer,
      pageTitle: data.title && data.title !== site.title ? `${data.title} – ${site.title}` : site.title,
      description: data.description || site.description,
      menu: menu(data.activeKey),
      main: data.main,
    });

  const cleanBody = (html) => withBasePath(sanitizeHtml(html), bp);
  const excerptOf = (p) => p.excerpt || htmlToText(p.body).slice(0, 180) + (htmlToText(p.body).length > 180 ? '…' : '');
  const imageTag = (p, cls) => (p.image ? `<img class="${cls}" src="${escapeHtml(mediaUrl(p.image))}" alt="">` : '');

  const card = (p) =>
    render(tpl['post-card'], { item: p, dateNl: formatDateNl(p.date), url: postUrl(p.slug), excerpt: excerptOf(p), image: imageTag(p, 'card-image') })
      .replace('<article class="card">', `<article class="card${p.image ? ' has-image' : ''}">`);

  const written = [];

  // Pagina's
  for (const p of pages) {
    let extra = '';
    if (p.slug === homeSlug && site.postsOnHome > 0 && posts.length) {
      extra = `<section class="latest"><h2>${escapeHtml(site.blogTitle || 'Nieuws')}</h2><div class="cards">${posts.slice(0, site.postsOnHome).map(card).join('')}</div><p><a href="${bp}/blog/">Alle berichten &rarr;</a></p></section>`;
    }
    const main = render(tpl.page, { item: p, body: cleanBody(p.body), extra, basePath: bp });
    const rel = p.slug === homeSlug ? 'index.html' : `${p.slug}/index.html`;
    await writeOut(out, rel, layout({ title: p.slug === homeSlug ? '' : p.title, description: p.description, activeKey: p.slug, main }));
    written.push(rel);
  }

  // Geen homepagina ingesteld of nog concept: toon het berichtenoverzicht
  if (!pages.some((p) => p.slug === homeSlug)) {
    const main = render(tpl.blog, { heading: site.title, cards: posts.map(card).join(''), empty: posts.length ? '' : '<p>Er staat nog niets op deze website.</p>' });
    await writeOut(out, 'index.html', layout({ title: '', main }));
    written.push('index.html');
  }

  // Berichten
  if (posts.length) {
    const main = render(tpl.blog, { heading: site.blogTitle || 'Nieuws', cards: posts.map(card).join(''), empty: '' });
    await writeOut(out, 'blog/index.html', layout({ title: site.blogTitle || 'Nieuws', activeKey: '__blog', main }));
    written.push('blog/index.html');
  }
  for (const p of posts) {
    const main = render(tpl.post, { item: p, dateNl: formatDateNl(p.date), body: cleanBody(p.body), image: imageTag(p, 'featured'), basePath: bp });
    await writeOut(out, `blog/${p.slug}/index.html`, layout({ title: p.title, description: p.description || excerptOf(p), activeKey: '__blog', main }));
    written.push(`blog/${p.slug}/index.html`);
  }

  // 404 en sitemap
  await writeOut(out, '404.html', layout({ title: 'Pagina niet gevonden', main: render(tpl['404'], { basePath: bp }) }));
  if (url) {
    const locs = written.filter((r) => r.endsWith('index.html')).map((r) => `${url}/${r.replace(/index\.html$/, '')}`);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.map((l) => `  <url><loc>${escapeHtml(l)}</loc></url>`).join('\n')}\n</urlset>\n`;
    await writeOut(out, 'sitemap.xml', xml);
  }

  const drafts = allPages.length + allPosts.length - pages.length - posts.length;
  log(`Website gemaakt in ${path.relative(root, out) || out}: ${pages.length} pagina('s), ${posts.length} bericht(en), ${drafts} concept(en) overgeslagen${bp ? `, basispad ${bp}` : ''}.`);
  return { pages, posts, written, out };
}

// Direct uitvoeren: node scripts/build.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((e) => {
    console.error('\nBouwen mislukt: ' + e.message);
    process.exit(1);
  });
}

