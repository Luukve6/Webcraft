// Wie is er ingelogd? Cloudflare Access zet bij elk verzoek naar /admin/* een ondertekend token
// (Cf-Access-Jwt-Assertion). We vertrouwen alleen dat token, niet een losse e-mailheader:
// die kan iedereen zelf meesturen.
//
// Instellingen (Pages > Settings > Variables):
//   ACCESS_TEAM  bijv. "mijnteam.cloudflareaccess.com"
//   ACCESS_AUD   de "Application Audience (AUD) Tag" van de Access-applicatie
// Lokaal testen (alleen op localhost): wrangler pages dev ... --binding DEV_EMAIL=jij@voorbeeld.nl

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
let certs = null; // { team, until, keys: [{ kid, key }] }

function b64url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
const json = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

async function publicKeys(team) {
  if (certs && certs.team === team && certs.until > Date.now()) return certs.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Access-sleutels niet op te halen');
  const keys = await Promise.all((await res.json()).keys.map(async (k) => ({
    kid: k.kid,
    key: await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']),
  })));
  certs = { team, keys, until: Date.now() + 3600_000 };
  return keys;
}

/** E-mailadres (kleine letters) van de ingelogde persoon, of null. */
export async function accessEmail(request, env) {
  if (env.DEV_EMAIL && LOCAL.has(new URL(request.url).hostname)) return String(env.DEV_EMAIL).toLowerCase();
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM || !env.ACCESS_AUD) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  try {
    const header = json(h);
    const claims = json(p);
    const k = (await publicKeys(env.ACCESS_TEAM)).find((x) => x.kid === header.kid);
    if (!k) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', k.key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    if (![].concat(claims.aud).includes(env.ACCESS_AUD)) return null;
    if (claims.iss !== `https://${env.ACCESS_TEAM}`) return null;
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    return claims.email ? String(claims.email).toLowerCase() : null;
  } catch {
    return null;
  }
}
