// Sessiebeheer voor de Cloudflare-basisversie.
// Cloudflare Access controleert de gebruiker vóórdat /admin wordt geladen.
export function loadSession() { return null; }
export function saveSession() { /* Access beheert de sessie */ }
export function clearSession() {
  try { localStorage.removeItem('cms.session'); sessionStorage.removeItem('cms.session'); } catch { /* opslag niet beschikbaar */ }
}
