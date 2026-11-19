// Inloggen en uitloggen.
//
// Er staat GEEN geheime sleutel in deze code. De toegangssleutel (token)
// van de gebruiker wordt alleen in de eigen browser bewaard:
//  - standaard in sessionStorage (weg zodra het tabblad/de browser sluit)
//  - met "Ingelogd blijven" in localStorage (blijft op deze computer)
//
// Twee manieren om aan een token te komen:
//  1. "Inloggen met GitHub" (OAuth) via een kleine eigen tussenschakel
//     (Cloudflare Worker, zie map worker/). Die bewaart het client secret.
//  2. Zelf een fine-grained token maken op GitHub en hier plakken.
//     Volledig gratis en zonder externe dienst.

const KEY = 'cms.auth';

export function loadSession() {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data.token === 'string' && data.token) return data;
      }
    } catch { /* opslag niet beschikbaar of beschadigd */ }
  }
  return null;
}

export function saveSession(token, { remember = false, method = 'token' } = {}) {
  clearSession();
  const data = JSON.stringify({ token, method, since: new Date().toISOString() });
  try {
    (remember ? localStorage : sessionStorage).setItem(KEY, data);
  } catch { /* privévenster: dan alleen in geheugen voor deze pagina */ }
}

export function clearSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* */ }
  try { localStorage.removeItem(KEY); } catch { /* */ }
}

/**
 * Opent een venster naar de OAuth-tussenschakel en wacht op de token.
 * De tussenschakel stuurt de token met postMessage terug naar dit venster
 * (alleen naar dit exacte adres, en wij accepteren alleen berichten van de tussenschakel).
 */
export function loginWithOAuth(oauthUrl) {
  return new Promise((resolve, reject) => {
    let base;
    try { base = new URL(oauthUrl); } catch { reject(new Error('Het adres van de inlogdienst (auth.oauthUrl) is ongeldig.')); return; }
    const authUrl = new URL('auth', base.href.endsWith('/') ? base.href : base.href + '/');
    authUrl.searchParams.set('origin', location.origin);
    const w = 600; const hgt = 720;
    const left = Math.max(0, (screen.width - w) / 2); const top = Math.max(0, (screen.height - hgt) / 2);
    const popup = window.open(authUrl.href, 'cms-github-login', `width=${w},height=${hgt},left=${left},top=${top}`);
    if (!popup) { reject(new Error('Het inlogvenster werd geblokkeerd. Sta pop-ups toe voor deze website en probeer opnieuw.')); return; }

    const timer = setInterval(() => {
      if (popup.closed) { cleanup(); reject(new Error('Het inlogvenster is gesloten voordat het inloggen klaar was.')); }
    }, 500);
    function onMessage(e) {
      if (e.origin !== base.origin) return; // alleen berichten van onze eigen inlogdienst
      const d = e.data;
      if (!d || d.type !== 'cms-oauth') return;
      cleanup();
      try { popup.close(); } catch { /* */ }
      if (d.error) reject(new Error(d.error));
      else if (typeof d.token === 'string' && d.token) resolve(d.token);
      else reject(new Error('Er kwam geen geldige toegangssleutel terug.'));
    }
    function cleanup() {
      clearInterval(timer);
      window.removeEventListener('message', onMessage);
    }
    window.addEventListener('message', onMessage);
  });
}
