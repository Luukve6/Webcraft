import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controleerHerstel, maakBackup, zipStream } from '../cloudflare/functions/_lib/backup.js';
import { onRequest } from '../cloudflare/functions/admin/api/[[route]].js';

function envForBackup(extra = {}) {
  const map = new Map();
  const kv = { async get(key, type) { const value = map.get(key); if (value === undefined) return null; return type === 'json' ? JSON.parse(value) : value; }, async put(key, value) { map.set(key, value); }, async delete(key) { map.delete(key); } };
  return { WEBCRAFT_DATA: kv, WEBCRAFT_SITE_ID: 'test-site-81c77a', DEV_EMAIL: 'admin@example.test', map, ...extra };
}
const b64 = (value) => Buffer.from(value).toString('base64');
const bytes = async (stream) => new Uint8Array(await new Response(stream).arrayBuffer());
function readStoredZip(zip) {
  const files = new Map(); let offset = 0; const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  while (offset + 4 <= zip.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true); const nameLength = view.getUint16(offset + 26, true); const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(zip.slice(offset + 30, offset + 30 + nameLength)); const start = offset + 30 + nameLength + extraLength;
    files.set(name, zip.slice(start, start + size)); offset = start + size;
  }
  return files;
}

test('backup bevat inhoud, media, geschiedenis en controlesommen zonder gebruikers of e-mail', async () => {
  const env = envForBackup();
  await env.WEBCRAFT_DATA.put('files', JSON.stringify({ versie: 2, tijd: '2026-01-01T00:00:00Z', email: 'privé@example.test', bestanden: { 'content/home.json': b64('{"title":"Hallo"}'), 'public/assets/docs/menu.pdf': b64('%PDF test') } }));
  await env.WEBCRAFT_DATA.put('history', JSON.stringify([{ versie: 1, tijd: '2025-12-31T00:00:00Z', email: 'oud@example.test', bestanden: { 'content/home.json': b64('{"title":"Oud"}') } }]));
  await env.WEBCRAFT_DATA.put('users', JSON.stringify([{ email: 'nooit@example.test', rol: 'admin' }]));
  const backup = await maakBackup(env); const zip = await bytes(zipStream(backup.entries)); const text = new TextDecoder().decode(zip); const files = readStoredZip(zip);
  assert.ok(files.has('data/current/content/home.json')); assert.equal(new TextDecoder().decode(files.get('data/current/content/home.json')), '{"title":"Hallo"}'); assert.equal(new TextDecoder().decode(files.get('data/current/public/assets/docs/menu.pdf')), '%PDF test');
  const manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json'))); assert.match(manifest.checksums['data/current/content/home.json'].sha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(text, /nooit@example\.test|privé@example\.test|oud@example\.test/);
  assert.equal(backup.manifest.status, 'partial'); assert.match(backup.manifest.missing[0].id, /pages-deployment/);
});

test('backup vereist een vaste site-identiteit', async () => {
  await assert.rejects(maakBackup(envForBackup({ WEBCRAFT_SITE_ID: '' })), (error) => error.status === 503);
});

test('herstelcontrole accepteert toegestane media, maar geen codebestanden', async () => {
  const env = envForBackup();
  await env.WEBCRAFT_DATA.put('files', JSON.stringify({ versie: 1, bestanden: {
    'content/home.json': b64('{"title":"Hallo"}'),
    'public/assets/docs/menu.pdf': b64('%PDF test'),
  } }));
  const backup = await maakBackup(env);
  const archief = Object.fromEntries(backup.entries
    .filter((entry) => entry.path.startsWith('data/current/'))
    .map((entry) => [entry.path, b64(entry.bytes)]));
  const gecontroleerd = await controleerHerstel(env, { manifest: backup.manifest, archief });
  assert.equal(gecontroleerd.bestanden['public/assets/docs/menu.pdf'], b64('%PDF test'));

  const kwaadaardig = { ...archief, 'data/current/admin/js/app.js': b64('alert(1)') };
  const code = Buffer.from('alert(1)');
  backup.manifest.checksums['data/current/admin/js/app.js'] = { sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', code))].map((b) => b.toString(16).padStart(2, '0')).join(''), bytes: code.length, required: true };
  await assert.rejects(controleerHerstel(env, { manifest: backup.manifest, archief: kwaadaardig }), (error) => error.status === 400 && /Onverwacht bestand/.test(error.message));
});

test('backup API is uitsluitend voor admins en levert een ZIP', async () => {
  const env = envForBackup();
  await env.WEBCRAFT_DATA.put('files', JSON.stringify({ versie: 1, bestanden: { 'content/a.json': b64('{}') } }));
  const call = (email) => onRequest({ request: new Request('http://localhost/admin/api/backup/export'), env: { ...env, DEV_EMAIL: email }, params: { route: ['backup', 'export'] } });
  const admin = await call('admin@example.test'); assert.equal(admin.status, 200); assert.equal(admin.headers.get('Content-Type'), 'application/zip');
  await env.WEBCRAFT_DATA.put('users', JSON.stringify([{ email: 'admin@example.test', rol: 'admin' }, { email: 'editor@example.test', rol: 'editor' }]));
  assert.equal((await call('editor@example.test')).status, 403);
});

test('herstel weigert andere sites en maakt een herstelpunt vóór vervanging', async () => {
  const env = envForBackup();
  await env.WEBCRAFT_DATA.put('files', JSON.stringify({ versie: 1, bestanden: { 'content/a.json': b64('{"oud":true}') } }));
  const backup = await maakBackup(env); const manifest = backup.manifest;
  const body = { manifest, archief: { 'data/current/content/a.json': b64('{"nieuw":true}') } };
  // Werk de checksum bij: dit simuleert een gecontroleerde, geldige export met nieuwe inhoud.
  const raw = Buffer.from('{"nieuw":true}'); manifest.checksums['data/current/content/a.json'].sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const res = await onRequest({ request: new Request('http://localhost/admin/api/backup/herstellen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, params: { route: ['backup', 'herstellen'] } });
  assert.equal(res.status, 200); assert.match([...env.map.keys()].join(','), /restore:/); assert.equal(JSON.parse(env.map.get('files')).bestanden['content/a.json'], b64('{"nieuw":true}'));
  manifest.site.id = 'andere-site';
  const bad = await onRequest({ request: new Request('http://localhost/admin/api/backup/herstellen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, params: { route: ['backup', 'herstellen'] } });
  assert.equal(bad.status, 403);
});
