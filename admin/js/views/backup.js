import { h, toast, confirmDialog } from '../ui.js';

const filename = () => `webcraft-backup-${new Date().toISOString().slice(0, 10)}.zip`;
const text = new TextDecoder();
function unzipStored(buffer) {
  const bytes = new Uint8Array(buffer); const view = new DataView(buffer); const files = new Map(); let at = 0;
  while (at + 4 <= bytes.length && view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true); const size = view.getUint32(at + 18, true); const nameSize = view.getUint16(at + 26, true); const extra = view.getUint16(at + 28, true);
    if (method !== 0) throw new Error('Deze ZIP gebruikt een niet-ondersteund formaat. Kies een originele Webcraft-back-up.');
    const name = text.decode(bytes.slice(at + 30, at + 30 + nameSize)); const start = at + 30 + nameSize + extra;
    if (start + size > bytes.length || !name || name.includes('..')) throw new Error('De ZIP is beschadigd.');
    files.set(name, bytes.slice(start, start + size)); at = start + size;
  }
  if (!files.has('manifest.json')) throw new Error('Dit ZIP-bestand bevat geen Webcraft-manifest.');
  return files;
}
function b64(bytes) { let out = ''; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(out); }
export function backupView(ctx) {
  const progress = h('p', { class: 'field-help', hidden: true, role: 'status' });
  const download = h('button', { type: 'button', class: 'btn btn-primary', onclick: start }, 'Download back-up');
  const restoreStatus = h('p', { class: 'field-help', hidden: true, role: 'status' });
  const overview = h('div', { hidden: true }); let candidate = null;
  const choose = h('input', { type: 'file', accept: '.zip,application/zip', class: 'sr-only', onchange: inspect });
  const chooseBtn = h('button', { type: 'button', class: 'btn', onclick: () => choose.click() }, 'ZIP-bestand kiezen');
  const restore = h('button', { type: 'button', class: 'btn btn-danger', disabled: true, onclick: restoreBackup }, 'Back-up herstellen');
  async function start() {
    download.disabled = true; progress.hidden = false; progress.textContent = 'Back-up wordt samengesteld…';
    try {
      const response = await fetch(`${ctx.config.storage.api.replace(/\/$/, '')}/backup/export`, { cache: 'no-store' });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || 'De back-up kon niet worden gemaakt.'); }
      const expected = Number(response.headers.get('X-Webcraft-Backup-Bytes')) || 0; const reader = response.body.getReader(); const chunks = []; let received = 0;
      for (;;) { const { value, done } = await reader.read(); if (done) break; chunks.push(value); received += value.byteLength; progress.textContent = expected ? `Back-up downloaden… ${Math.min(100, Math.round(received / expected * 100))}%` : 'Back-up downloaden…'; }
      const blob = new Blob(chunks, { type: 'application/zip' }); const link = h('a', { href: URL.createObjectURL(blob), download: filename() }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      progress.textContent = 'Download gestart. Bewaar het ZIP-bestand op een veilige plek.'; toast('De websitegegevens-back-up is gedownload.', 'success');
    } catch (error) { progress.textContent = ''; progress.hidden = true; toast('Back-up mislukt: ' + error.message, 'error', 10000); } finally { download.disabled = false; }
  }
  async function inspect() {
    restore.disabled = true; overview.hidden = true; restoreStatus.hidden = false; restoreStatus.textContent = 'Back-up controleren…';
    try {
      const file = choose.files[0]; if (!file) return;
      const files = unzipStored(await file.arrayBuffer()); const manifest = JSON.parse(text.decode(files.get('manifest.json')));
      if (manifest.format !== 'webcraft-backup' || manifest.formatVersion !== 1) throw new Error('Dit is geen ondersteunde Webcraft-back-up.');
      const archief = {};
      for (const [path, bytes] of files) if (path.startsWith('data/current/') || path.startsWith('data/history/')) archief[path] = b64(bytes);
      const current = Object.keys(archief).filter((p) => p.startsWith('data/current/')).length; const historic = Object.keys(archief).filter((p) => p.startsWith('data/history/')).length;
      if (!current) throw new Error('De back-up bevat geen herstelbare websitegegevens.');
      candidate = { manifest, archief };
      overview.replaceChildren(h('h3', {}, 'Klaar om te herstellen'), h('p', {}, `${current} huidige bestanden en ${historic} geschiedenisbestanden worden teruggezet naar deze website.`), h('p', { class: 'field-help' }, `Gemaakt op ${new Date(manifest.createdAt).toLocaleString('nl-NL')}. Er wordt eerst automatisch een herstelpunt gemaakt.`));
      overview.hidden = false; restore.disabled = false; restoreStatus.textContent = 'De back-up is gecontroleerd. Controleer het overzicht en bevestig daarna het herstel.';
    } catch (error) { candidate = null; restoreStatus.textContent = 'Controle mislukt: ' + error.message; toast('Deze back-up kan niet worden gebruikt.', 'error'); }
  }
  async function restoreBackup() {
    if (!candidate) return;
    const ok = await confirmDialog('Back-up herstellen', 'De huidige websitegegevens worden vervangen. Webcraft maakt eerst een herstelpunt. Weet u zeker dat u wilt doorgaan?', 'Ja, herstellen', { danger: true, cancelLabel: 'Annuleren' });
    if (!ok) return;
    restore.disabled = true; chooseBtn.disabled = true; restoreStatus.hidden = false; restoreStatus.textContent = 'Back-up herstellen en resultaat controleren…';
    try {
      const res = await fetch(`${ctx.config.storage.api.replace(/\/$/, '')}/backup/herstellen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(candidate) });
      const result = await res.json().catch(() => ({})); if (!res.ok) throw new Error(result.message || 'Herstellen mislukt.');
      await ctx.store.load(); ctx.navigate('#/', { force: true }); toast('Back-up hersteld. Er is eerst een herstelpunt gemaakt.', 'success', 10000);
    } catch (error) { restoreStatus.textContent = 'Herstellen mislukt: ' + error.message; restore.disabled = false; chooseBtn.disabled = false; }
  }
  return { el: h('div', { class: 'view' }, h('div', { class: 'view-header' }, h('div', {}, h('h1', {}, 'Back-ups'), h('p', {}, 'Sla een kopie van de websitegegevens op voordat u grote wijzigingen doet.'))),
    h('section', { class: 'card form' }, h('h2', {}, 'Website exporteren'), h('p', {}, 'U downloadt één ZIP-bestand dat u ook buiten Webcraft kunt openen en controleren.'), h('h3', {}, 'Dit wordt meegenomen'), h('ul', {}, h('li', {}, 'De huidige pagina’s, berichten en andere bewerkbare inhoud'), h('li', {}, 'Foto’s en documenten die via Webcraft zijn toegevoegd'), h('li', {}, 'De bewaarde tekstversies en de huidige gegenereerde website-inhoud')), h('p', { class: 'field-help' }, 'Voor uw veiligheid worden gebruikers, rollen, Cloudflare Access, wachtwoorden, tokens en sleutels nooit meegenomen.'), h('p', { class: 'field-help' }, 'De vaste HTML-, CSS- en JavaScriptbestanden van de Pages-deployment kunnen vanuit de huidige opslag niet veilig worden uitgelezen. De ZIP meldt dit duidelijk als ontbrekend; bewaar daarom ook de deployment-bronmap of een apart deployment-archief.'), h('p', { class: 'field-help' }, 'Een download kan maximaal 40 MB aan websitegegevens bevatten. Bij grotere websites toont Webcraft een duidelijke melding in plaats van een onvolledige ZIP.'), h('div', { class: 'btn-row' }, download), progress),
    h('section', { class: 'card form' }, h('h2', {}, 'Back-up herstellen'), h('p', {}, 'Kies een eerder gedownloade Webcraft-back-up. De inhoud en de websitekoppeling worden eerst gecontroleerd.'), choose, h('div', { class: 'btn-row' }, chooseBtn, restore), restoreStatus, overview),
    h('p', {}, h('a', { href: '#/settings' }, '← Terug naar Algemeen'))) };
}
