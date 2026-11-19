#!/usr/bin/env node
// Eenvoudige lokale webserver voor de gemaakte website in _site/.
//
//   node scripts/serve.mjs          -> toont _site op http://localhost:8080
//   node scripts/serve.mjs --mock   -> idem, plus een nagebootste GitHub API
//                                      zodat je /admin kunt uitproberen zonder echte GitHub.
//
// Poort aanpassen: PORT=3000 node scripts/serve.mjs

import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockGitHub } from './mock-github.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, '_site');
const PORT = Number(process.env.PORT || 8080);
const MOCK = process.argv.includes('--mock');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
};

async function walk(dir, base = dir, out = new Map()) {
  if (!existsSync(dir)) return out;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else out.set(path.relative(ROOT, full).split(path.sep).join('/'), await readFile(full));
  }
  return out;
}

let mock = null;
if (MOCK) {
  const seed = new Map();
  for (const dir of ['content', 'media']) for (const [p, buf] of await walk(path.join(ROOT, dir))) seed.set(p, buf);
  mock = createMockGitHub({ owner: 'demo', repo: 'website', seed });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (mock && url.pathname.startsWith('/__mock_github/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const r = await mock.handle(req.method, req.url, req.headers, Buffer.concat(chunks).toString('utf8'));
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(await r.text());
      return;
    }

    if (mock && url.pathname === '/admin/config.json') {
      const cfg = JSON.parse(await readFile(path.join(SITE, 'admin/config.json'), 'utf8'));
      Object.assign(cfg, { apiBase: '/__mock_github', mock: true, mockToken: mock.token, siteUrl: `http://localhost:${PORT}` });
      cfg.repo = { owner: mock.owner, name: mock.repo, branch: mock.branch };
      cfg.auth = { oauthUrl: '' };
      res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(cfg, null, 2));
      return;
    }

    let rel = decodeURIComponent(url.pathname);
    let file = path.normalize(path.join(SITE, rel));
    if (!file.startsWith(SITE)) { res.writeHead(403); res.end('Verboden'); return; }
    if (existsSync(file) && (await stat(file)).isDirectory()) {
      if (!rel.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' }); res.end(); return; }
      file = path.join(file, 'index.html');
    }
    if (!existsSync(file)) {
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      res.end(existsSync(path.join(SITE, '404.html')) ? await readFile(path.join(SITE, '404.html')) : 'Niet gevonden');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Serverfout: ' + e.message);
  }
});

if (!existsSync(SITE)) {
  console.error('Map _site bestaat nog niet. Voer eerst "npm run build" uit.');
  process.exit(1);
}
server.listen(PORT, () => {
  console.log(`Website:  http://localhost:${PORT}/`);
  console.log(`Beheer:   http://localhost:${PORT}/admin/${MOCK ? '   (testmodus: nagebootste GitHub, niets wordt echt opgeslagen)' : ''}`);
});
