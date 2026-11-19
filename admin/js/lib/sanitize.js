// HTML-opschoner (sanitizer) zonder afhankelijkheden.
// Wordt gebruikt in de beheeromgeving (bij opslaan en plakken) én in het
// build-script (bij het maken van de website), zodat kwaadaardige code zoals
// <script> of onclick="..." nooit op de website terechtkomt.
//
// Werkt met een eenvoudige tekenscanner in plaats van de DOM, zodat dezelfde
// code ook in Node.js draait.

const ALLOWED_TAGS = new Set([
  'p', 'br', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li',
  'blockquote', 'img', 'figure', 'figcaption', 'hr', 'code', 'pre',
]);

// Tags die we omzetten naar een toegestane variant.
const RENAME = {
  b: 'strong', i: 'em', strike: 's', del: 's', h1: 'h2', h5: 'h4', h6: 'h4', div: 'p',
};

// Tags waarvan we de complete inhoud weggooien.
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg',
  'math', 'textarea', 'select', 'head', 'title', 'frameset', 'frame', 'applet',
  'xml', 'button', 'form',
]);

const VOID_TAGS = new Set(['br', 'hr', 'img']);

const ALLOWED_ATTRS = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
};

const URL_ATTRS = new Set(['href', 'src']);

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', tab: '\t', newline: '\n' };

function decodeEntities(str) {
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return '';
      try { return String.fromCodePoint(n); } catch { return ''; }
    }
    const v = NAMED_ENTITIES[code.toLowerCase()];
    return v === undefined ? m : v;
  });
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeText(str) {
  // Laat geldige entiteiten staan, maak al het andere veilig.
  return str
    .replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Controleert of een URL veilig is (geen javascript:, data:, vbscript: enz.). */
export function isSafeUrl(value, { allowDataImage = false } = {}) {
  // Verwijder controle- en spatietekens die browsers negeren.
  const v = decodeEntities(String(value)).replace(/[\u0000- \u007f- ]/g, '').toLowerCase();
  if (v === '') return false;
  const m = /^([a-z][a-z0-9+.-]*):/.exec(v);
  if (!m) return true; // relatieve URL (bijv. /over-ons/ of #kop)
  const scheme = m[1];
  if (['http', 'https', 'mailto', 'tel'].includes(scheme)) return true;
  if (allowDataImage && /^data:image\/(png|jpe?g|gif|webp);base64,/.test(v)) return true;
  return false;
}

function parseAttributes(src) {
  const attrs = [];
  const re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(src))) {
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    attrs.push([m[1].toLowerCase(), value]);
  }
  return attrs;
}

/** Zoekt het einde van een tag ('>') en houdt rekening met aanhalingstekens. */
function findTagEnd(s, from) {
  let quote = null;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

/**
 * Maakt HTML veilig: alleen toegestane tags en attributen blijven over,
 * gevaarlijke URL's verdwijnen en tags worden netjes gesloten.
 */
export function sanitizeHtml(input) {
  const s = String(input ?? '');
  let out = '';
  const stack = [];
  let i = 0;

  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) {
      out += escapeText(s.slice(i));
      break;
    }
    if (lt > i) out += escapeText(s.slice(i, lt));
    i = lt;

    // Commentaar
    if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4);
      i = end === -1 ? s.length : end + 3;
      continue;
    }
    const next = s[i + 1] || '';
    // Doctype, CDATA, processing instructions
    if (next === '!' || next === '?') {
      const end = s.indexOf('>', i);
      i = end === -1 ? s.length : end + 1;
      continue;
    }
    const isClose = next === '/';
    const nameStart = isClose ? i + 2 : i + 1;
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(s.slice(nameStart, nameStart + 64));
    if (!nameMatch) {
      // Losse '<' is gewone tekst
      out += '&lt;';
      i += 1;
      continue;
    }
    const end = findTagEnd(s, nameStart + nameMatch[0].length);
    if (end === -1) {
      // Onafgesloten tag: rest als tekst behandelen
      out += escapeText(s.slice(i));
      break;
    }
    let name = nameMatch[0].toLowerCase();
    const attrSrc = s.slice(nameStart + nameMatch[0].length, end);
    i = end + 1;

    if (DROP_WITH_CONTENT.has(name)) {
      if (!isClose && !/\/\s*$/.test(attrSrc)) {
        // Sla alles over tot en met de bijbehorende sluittag
        const closeRe = new RegExp('</' + name + '(?=[\\s/>])[^>]*>', 'ig');
        closeRe.lastIndex = i;
        const cm = closeRe.exec(s);
        i = cm ? cm.index + cm[0].length : s.length;
      }
      continue;
    }

    name = RENAME[name] || name;
    if (!ALLOWED_TAGS.has(name)) continue; // onbekende tag: weglaten, inhoud behouden

    if (isClose) {
      if (VOID_TAGS.has(name)) continue;
      const idx = stack.lastIndexOf(name);
      if (idx === -1) continue;
      while (stack.length > idx) out += `</${stack.pop()}>`;
      continue;
    }

    // Openingstag: attributen filteren
    const allowed = ALLOWED_ATTRS[name] || [];
    let attrOut = '';
    let hasHref = false;
    for (const [attr, rawValue] of parseAttributes(attrSrc)) {
      if (!allowed.includes(attr)) continue;
      const value = decodeEntities(rawValue);
      if (URL_ATTRS.has(attr)) {
        if (!isSafeUrl(value, { allowDataImage: false })) continue;
        if (attr === 'href') hasHref = true;
      }
      if ((attr === 'width' || attr === 'height') && !/^\d{1,5}$/.test(value)) continue;
      attrOut += ` ${attr}="${escapeHtml(value)}"`;
    }
    if (name === 'img' && !/ src="/.test(attrOut)) continue; // afbeelding zonder (veilige) bron
    if (name === 'a' && !hasHref) {
      // Link zonder geldig adres: als gewone tekst behouden
      continue;
    }
    if (name === 'a' && /href="https?:/i.test(attrOut)) attrOut += ' rel="noopener"';

    // Geen <p> binnen <p>: sluit de vorige eerst
    if (name === 'p' && stack[stack.length - 1] === 'p') out += `</${stack.pop()}>`;

    if (VOID_TAGS.has(name)) {
      out += `<${name}${attrOut}>`;
    } else {
      out += `<${name}${attrOut}>`;
      stack.push(name);
    }
  }
  while (stack.length) out += `</${stack.pop()}>`;
  // Lege alinea's opruimen
  return out.replace(/<p>(\s|&nbsp;|<br>)*<\/p>/g, '').trim();
}

/** Zet HTML om naar platte tekst (voor samenvattingen en zoeken). */
export function htmlToText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|h[1-6]|li|blockquote|figcaption)>/gi, ' ')
      .replace(/<[^>]*>/g, ''),
  ).replace(/\s+/g, ' ').trim();
}
