// API van het beheer (achter Cloudflare Access):
//   GET  /admin/api/ik                               { email, rol }
//   GET  /admin/api/bestanden                        { pad: base64 }  (header X-Webcraft-Versie)
//   POST /admin/api/opslaan                          { schrijf, verwijder, versie } -> { versie }
//   GET  /admin/api/geschiedenis                     [{ nummer, versie, tijd, email, wat }]
//   POST /admin/api/geschiedenis/<nummer>/terugzetten
//   GET  /admin/api/backup/export                    admin: inspecteerbare websitegegevens-ZIP
//   GET  /admin/api/gebruikers                       alleen admin
//   POST /admin/api/gebruikers  { gebruikers: [...] } alleen admin

import { accessEmail } from '../../_lib/access.js';
import * as opslag from '../../_lib/opslag.js';
import { maakBackup, zipStream, controleerHerstel } from '../../_lib/backup.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export async function onRequest({ request, env, params }) {
  if (!env.WEBCRAFT_DATA) return json({ message: 'De KV-koppeling WEBCRAFT_DATA ontbreekt in Cloudflare Pages.' }, 500);
  const email = await accessEmail(request, env);
  if (!email) return json({ message: 'Niet ingelogd. Ververs de pagina om opnieuw in te loggen.' }, 401);
  const rol = await opslag.rolVan(env, email);
  if (!rol) return json({ message: `${email} heeft geen toegang tot dit beheer. Vraag de eigenaar om je toe te voegen.` }, 403);

  const route = [].concat(params.route || []).join('/');
  const method = request.method;
  // Alleen JSON: zo kan een andere website geen formulier namens jou laten opslaan.
  if (method === 'POST' && !(request.headers.get('Content-Type') || '').includes('application/json')) {
    return json({ message: 'Verwacht JSON.' }, 415);
  }

  try {
    if (method === 'GET' && route === 'ik') return json({ email, rol });
    if (method === 'GET' && route === 'bestanden') {
      const alles = await opslag.leesAlles(env);
      return json(alles.bestanden, 200, { 'X-Webcraft-Versie': String(alles.versie) });
    }
    if (method === 'POST' && route === 'opslaan') {
      return json({ ok: true, versie: await opslag.schrijf(env, await request.json(), email) });
    }
    if (method === 'GET' && route === 'geschiedenis') return json(await opslag.geschiedenis(env));
    if (method === 'GET' && route === 'backup/export') {
      if (rol !== 'admin') return json({ message: 'Alleen een admin kan een back-up downloaden.' }, 403);
      const backup = await maakBackup(env);
      const naam = `webcraft-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      return new Response(zipStream(backup.entries), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${naam}"`, 'Cache-Control': 'no-store', 'X-Webcraft-Backup-Bytes': String(backup.bytes), 'X-Webcraft-Backup-Status': backup.complete ? 'complete' : 'partial' } });
    }
    if (method === 'POST' && route === 'backup/herstellen') {
      if (rol !== 'admin') return json({ message: 'Alleen een admin kan een back-up herstellen.' }, 403);
      const backup = await controleerHerstel(env, await request.json());
      return json({ ok: true, ...(await opslag.herstelBestanden(env, backup.bestanden, backup.geschiedenis, email)) });
    }
    const terug = method === 'POST' && route.match(/^geschiedenis\/(\d+)\/terugzetten$/);
    if (terug) return json({ ok: true, versie: await opslag.terugzetten(env, Number(terug[1]), email) });
    if (route === 'gebruikers') {
      if (rol !== 'admin') return json({ message: 'Alleen een admin kan gebruikers beheren.' }, 403);
      if (method === 'GET') return json(await opslag.gebruikers(env));
      if (method === 'POST') return json(await opslag.bewaarGebruikers(env, (await request.json()).gebruikers, email));
    }
    return json({ message: 'Niet gevonden.' }, 404);
  } catch (e) {
    return json({ message: e.status ? e.message : 'Er ging iets mis bij het opslaan: ' + e.message }, e.status || 500);
  }
}
