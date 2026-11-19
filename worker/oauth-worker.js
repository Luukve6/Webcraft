// Kleine inlogdienst ("OAuth-tussenschakel") voor "Inloggen met GitHub".
// Draait gratis als Cloudflare Worker. Zie worker/README.md.
//
// Waarom nodig? Voor "Inloggen met GitHub" moet een geheime sleutel
// (client secret) worden gebruikt. Die mag NOOIT in de website/beheer-code
// staan, want die code is voor iedereen leesbaar. Deze Worker bewaart het
// secret veilig (als Cloudflare-secret) en wisselt de inlogcode van GitHub
// om voor een toegangssleutel, die hij alleen teruggeeft aan je eigen beheerpagina.
//
// Werkt met een GitHub App (aanbevolen) of een gewone OAuth App:
//  - GitHub App: de sleutel werkt alleen voor de repositories waar de app op is geïnstalleerd,
//    met de rechten die je de app geeft, en verloopt na 8 uur. Geen OAUTH_SCOPE nodig.
//  - OAuth App: zet OAUTH_SCOPE op "repo". De sleutel werkt dan voor ALLE repositories van de gebruiker.
//
// Instellingen (in Cloudflare):
//   GITHUB_CLIENT_ID      (variabele) Client ID van je GitHub App (of OAuth App)
//   GITHUB_CLIENT_SECRET  (secret)    Client secret van je GitHub App (of OAuth App)
//   ALLOWED_ORIGINS       (variabele) Adressen van je website(s), komma-gescheiden,
//                                     bijv. "https://www.example.nl,https://jouw-site.pages.dev"
//   OAUTH_SCOPE           (variabele, optioneel) alleen voor een OAuth App: "repo" (of "public_repo")

const COOKIE = 'cms_oauth';

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}

function randomState() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** HTML-pagina die het resultaat naar het beheervenster stuurt en zichzelf sluit. */
function resultPage(origin, payload, status = 200) {
  // JSON veilig in een <script> zetten (geen </script> of HTML-tekens)
  const data = JSON.stringify({ type: 'cms-oauth', ...payload }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const target = JSON.stringify(origin || '').replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Inloggen</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px">
<p id="msg">${payload.error ? 'Inloggen is niet gelukt. Je kunt dit venster sluiten.' : 'Inloggen gelukt. Dit venster sluit vanzelf…'}</p>
<script>
(function () {
  var data = ${data};
  var target = ${target};
  if (window.opener && target) { window.opener.postMessage(data, target); setTimeout(function () { window.close(); }, 300); }
  else { document.getElementById('msg').textContent = 'Open het beheer opnieuw en probeer het nog eens.'; }
})();
</script></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
      'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

function text(status, body) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return text(500, 'De inlogdienst is nog niet ingesteld (GITHUB_CLIENT_ID en GITHUB_CLIENT_SECRET ontbreken).');
    }

    // Stap 1: beheerpagina opent /auth?origin=https://mijnsite.nl
    if (path === '/auth') {
      const origin = (url.searchParams.get('origin') || '').replace(/\/$/, '');
      if (!allowedOrigins(env).includes(origin)) {
        return text(403, `Dit adres (${origin || 'onbekend'}) mag deze inlogdienst niet gebruiken. Voeg het toe aan ALLOWED_ORIGINS.`);
      }
      const state = randomState();
      const gh = new URL('https://github.com/login/oauth/authorize');
      gh.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      gh.searchParams.set('redirect_uri', `${url.origin}/callback`);
      if (env.OAUTH_SCOPE) gh.searchParams.set('scope', env.OAUTH_SCOPE); // een GitHub App gebruikt zijn eigen rechten
      gh.searchParams.set('state', state);
      gh.searchParams.set('allow_signup', 'false');
      return new Response(null, {
        status: 302,
        headers: {
          Location: gh.href,
          'Cache-Control': 'no-store',
          'Set-Cookie': `${COOKIE}=${encodeURIComponent(state + '|' + origin)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }

    // Stap 2: GitHub stuurt de gebruiker terug naar /callback?code=...&state=...
    if (path === '/callback') {
      const cookie = readCookie(request, COOKIE) || '';
      const sep = cookie.indexOf('|');
      const savedState = sep > 0 ? cookie.slice(0, sep) : '';
      const origin = sep > 0 ? cookie.slice(sep + 1) : '';
      if (!origin || !allowedOrigins(env).includes(origin)) return text(400, 'Inlogsessie verlopen of ongeldig. Probeer opnieuw vanuit het beheer.');
      const state = url.searchParams.get('state') || '';
      if (!savedState || state !== savedState) return resultPage(origin, { error: 'Beveiligingscontrole mislukt (state komt niet overeen). Probeer opnieuw.' }, 400);
      if (url.searchParams.get('error')) return resultPage(origin, { error: 'Inloggen is geannuleerd of geweigerd.' }, 400);
      const code = url.searchParams.get('code');
      if (!code) return resultPage(origin, { error: 'Geen inlogcode ontvangen van GitHub.' }, 400);

      let data;
      try {
        const res = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'webcraft-login' },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: `${url.origin}/callback`,
          }),
        });
        data = await res.json();
      } catch {
        return resultPage(origin, { error: 'GitHub was niet bereikbaar. Probeer het later opnieuw.' }, 502);
      }
      if (!data || !data.access_token) return resultPage(origin, { error: 'GitHub gaf geen toegangssleutel terug. Probeer opnieuw.' }, 400);
      return resultPage(origin, { token: data.access_token });
    }

    if (path === '/') return text(200, 'Webcraft-inlogdienst werkt. Gebruik /auth vanuit het beheer.');
    return text(404, 'Niet gevonden');
  },
};
