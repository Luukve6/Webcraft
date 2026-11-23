// Website: de inhoud komt live uit Cloudflare KV (direct na opslaan in het beheer).
// - /assets/data/inhoud.js        uit KV (gebouwd bij elke opslag)
// - /assets/docs/*, /assets/img/fotos/*  pdf's en foto's uit het beheer
// - HTML-pagina's: naam/adres/telefoon uit Algemeen ingevuld, en nieuwe pagina's uit het beheer
// Is KV nog leeg, dan krijgen bezoekers gewoon de bestanden zoals ze zijn meegeleverd.

import { paginaHtml, waardenVervangen } from './_lib/site.js';

const TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const KORT = 'public, max-age=30';

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const kv = env.WEBCRAFT_DATA;
  if (!kv || url.pathname.startsWith('/admin/') || !['GET', 'HEAD'].includes(request.method)) return next();

  if (url.pathname === '/assets/data/inhoud.js') {
    const js = await kv.get('inhoud.js', { cacheTtl: 30 });
    if (js === null) return next();
    return new Response(js, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': KORT } });
  }
  if (/^\/assets\/(docs|img\/fotos)\//.test(url.pathname)) {
    const bin = await kv.get('bin:' + decodeURIComponent(url.pathname), { type: 'arrayBuffer', cacheTtl: 60 });
    if (bin === null) return next();
    const ext = url.pathname.split('.').pop().toLowerCase();
    return new Response(bin, { headers: { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=60' } });
  }

  const res = await next();
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  const meta = await kv.get('site', { type: 'json', cacheTtl: 30 });
  if (!meta) return res;

  const slug = url.pathname.replace(/^\/+|\/+$|\.html$/g, '');
  let html;
  let status = res.status;
  if (res.status === 404 && meta.paginas && meta.paginas[slug]) {
    html = paginaHtml(meta.paginas[slug], slug);
    status = 200;
  } else {
    html = await res.text();
  }
  const headers = new Headers(res.headers);
  headers.delete('Content-Length');
  headers.delete('ETag');
  headers.set('Cache-Control', KORT);
  return new Response(waardenVervangen(html, meta.waarden), { status, headers });
}
