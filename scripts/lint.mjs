#!/usr/bin/env node
// Controles zonder externe pakketten:
//  1. Alle JavaScript-bestanden hebben geldige syntax (node --check)
//  2. Alle JSON-bestanden zijn geldig
//  3. Geen geheime sleutels/tokens in de repository (beveiligingscontrole)
//  4. Inhoudsbestanden: bestandsnaam = adres (slug)

import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', 'node_modules', '_site', '.wrangler']);

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = await walk(ROOT);
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const problems = [];

// 1. Syntax
for (const f of files.filter((x) => /\.(m?js)$/.test(x))) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`${rel(f)}: syntaxfout\n${r.stderr.trim()}`);
}

// 2. JSON
for (const f of files.filter((x) => x.endsWith('.json'))) {
  try { JSON.parse(await readFile(f, 'utf8')); } catch (e) { problems.push(`${rel(f)}: ongeldige JSON (${e.message})`); }
}

// 3. Geheimen
const SECRET_PATTERNS = [
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'GitHub-token'],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/, 'GitHub fine-grained token'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'privésleutel'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS-sleutel'],
  [/client_secret\s*[:=]\s*["'][0-9a-f]{40}["']/i, 'OAuth client secret'],
];
for (const f of files) {
  if (/\.(png|jpe?g|gif|webp|avif|ico|woff2?)$/i.test(f)) continue;
  const text = await readFile(f, 'utf8');
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(text)) problems.push(`${rel(f)}: lijkt een ${label} te bevatten. Zet nooit geheime sleutels in de repository!`);
  }
}

// 4. Inhoud
for (const f of files.filter((x) => /content[\\/](pages|posts)[\\/][^\\/]+\.json$/.test(x))) {
  try {
    const data = JSON.parse(await readFile(f, 'utf8'));
    const expected = path.basename(f, '.json');
    if (data.slug !== expected) problems.push(`${rel(f)}: slug "${data.slug}" hoort "${expected}" te zijn`);
    if (!['draft', 'published'].includes(data.status)) problems.push(`${rel(f)}: status moet "draft" of "published" zijn`);
  } catch { /* al gemeld bij JSON */ }
}

if (problems.length) {
  console.error(`Lint: ${problems.length} probleem/problemen gevonden:\n\n- ` + problems.join('\n- '));
  process.exit(1);
}
console.log(`Lint: alles in orde (${files.length} bestanden gecontroleerd).`);
