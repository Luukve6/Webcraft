// Gedeelde regels voor inhoud (pagina's en berichten).
// Gebruikt door de beheeromgeving en door het build-script.

export const TYPES = {
  pages: { dir: 'content/pages', single: 'pagina', plural: "pagina's", label: "Pagina's" },
  posts: { dir: 'content/posts', single: 'bericht', plural: 'berichten', label: 'Berichten' },
};

// Adressen die het systeem zelf gebruikt en dus niet als pagina-adres mogen.
export const RESERVED_SLUGS = new Set(['admin', 'media', 'blog', 'assets', 'index', '404', 'sitemap', 'content']);

export const STATUS = { DRAFT: 'draft', PUBLISHED: 'published' };

/** Maakt van een titel een net webadres: "Over ons & contact" -> "over-ons-contact". */
export function slugify(text) {
  return String(text ?? '')
    .replace(/½/g, ' half ').replace(/¼/g, ' kwart ').replace(/¾/g, ' driekwart ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80;
}

export function itemPath(type, slug) {
  return `${TYPES[type].dir}/${slug}.json`;
}

/** Vult ontbrekende velden aan met standaardwaarden. */
export function normalizeItem(type, raw = {}) {
  const now = new Date().toISOString();
  const item = {
    title: String(raw.title ?? '').trim(),
    slug: String(raw.slug ?? '').trim(),
    status: raw.status === STATUS.PUBLISHED ? STATUS.PUBLISHED : STATUS.DRAFT,
    body: String(raw.body ?? ''),
    description: String(raw.description ?? ''),
    created: raw.created || now,
    updated: raw.updated || raw.created || now,
  };
  if (type === 'pages') {
    item.inMenu = Boolean(raw.inMenu);
    item.menuOrder = Number.isFinite(Number(raw.menuOrder)) ? Number(raw.menuOrder) : 10;
    // Vaste pagina: bestaat al in de website (eigen ontwerp). Adres en status liggen vast.
    if (raw.fixed) { item.fixed = true; item.status = STATUS.PUBLISHED; }
  } else {
    item.date = raw.date || (raw.created || now).slice(0, 10);
    item.excerpt = String(raw.excerpt ?? '');
    item.image = String(raw.image ?? '');
  }
  return item;
}

/**
 * Controleert een item. Geeft een object terug met per veld een
 * Nederlandse foutmelding; leeg object betekent: alles in orde.
 */
export function validateItem(type, item, otherSlugs = []) {
  const errors = {};
  if (!item.title || !item.title.trim()) errors.title = 'Vul een titel in.';
  else if (item.title.length > 200) errors.title = 'De titel is te lang (maximaal 200 tekens).';

  if (!item.slug) errors.slug = 'Vul een adres in.';
  else if (!isValidSlug(item.slug)) errors.slug = 'Gebruik alleen kleine letters, cijfers en streepjes (bijv. over-ons).';
  else if (type === 'pages' && RESERVED_SLUGS.has(item.slug)) errors.slug = `Het adres "${item.slug}" is gereserveerd. Kies een ander adres.`;
  else if (otherSlugs.includes(item.slug)) errors.slug = `Er bestaat al een ${TYPES[type].single} met het adres "${item.slug}".`;

  if (type === 'posts' && item.date && !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) errors.date = 'Gebruik een geldige datum.';
  if (item.description && item.description.length > 300) errors.description = 'Maximaal 300 tekens.';
  return errors;
}

/** Zet een item om naar de tekst die in het JSON-bestand komt. */
export function serializeItem(type, item) {
  const clean = normalizeItem(type, item);
  return JSON.stringify(clean, null, 2) + '\n';
}

export function parseItem(type, text, path = '') {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Bestand ${path} bevat geen geldige JSON: ${e.message}`);
  }
  const item = normalizeItem(type, data);
  if (!item.slug && path) item.slug = path.split('/').pop().replace(/\.json$/, '');
  return item;
}

export const DEFAULT_SITE = {
  title: 'Mijn website',
  description: '',
  url: '',
  homepage: 'home',
  showBlogInMenu: true,
  blogTitle: 'Nieuws',
  postsOnHome: 3,
  footer: '',
};

export function normalizeSite(raw = {}) {
  const s = { ...DEFAULT_SITE, ...raw };
  s.postsOnHome = Math.max(0, Math.min(20, parseInt(s.postsOnHome, 10) || 0));
  s.showBlogInMenu = Boolean(s.showBlogInMenu);
  return s;
}

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

/** "2026-11-19" -> "19 november 2026" */
export function formatDateNl(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return '';
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}
