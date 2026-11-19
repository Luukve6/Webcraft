#!/usr/bin/env node
// Maakt een demo-zip die je op elke Windows-pc kunt uitproberen zonder iets
// te installeren (geen Node, geen GitHub-account).
//
//   npm run demo                      -> dist/CMS-demo.zip (voorbeeldwebsite van dit CMS)
//   npm run demo -- --site <naam> [--repo ../<website>]
//                                     -> dist/<Naam>-demo.zip (je eigen site + beheer, zie sites/<naam>/demo.json)
//
// In de zip zit de website plus /admin in demomodus: de nagebootste GitHub
// draait in de browser en wijzigingen blijven in die browser bewaard.
// Starten gaat met Start-demo.cmd (een kleine webserver in PowerShell).

import { mkdir, readFile, readdir, rm, writeFile, copyFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const SITE = arg('--site');

async function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (!e.name.startsWith('.')) out.push(full);
  }
  return out;
}

async function seedFrom(base, dirs) {
  const seed = {};
  for (const dir of dirs) {
    for (const f of await walk(path.join(base, dir))) {
      seed[path.relative(base, f).split(path.sep).join('/')] = (await readFile(f)).toString('base64');
    }
  }
  return seed;
}

/** Bouwt de demomap. Geeft { dir, zip } terug. */
export async function makeDemo({ site = SITE, repo = arg('--repo'), zip = true } = {}) {
  const name = site ? `${site[0].toUpperCase()}${site.slice(1)}-demo` : 'CMS-demo';
  const DIST = path.join(ROOT, 'dist');
  const DIR = path.join(DIST, name);
  const WEB = path.join(DIR, 'website');
  await rm(DIR, { recursive: true, force: true });
  await rm(path.join(DIST, name + '.zip'), { force: true });
  await mkdir(DIR, { recursive: true });

  let seed;
  let cfg;
  let leesmij = path.join(ROOT, 'demo', 'LEESMIJ.txt');

  if (!site) {
    await build({ out: WEB, basePath: '', siteUrl: '', quiet: true });
    seed = await seedFrom(ROOT, ['content', 'media']);
    cfg = JSON.parse(await readFile(path.join(ROOT, 'admin/config.json'), 'utf8'));
    cfg.repo = { owner: 'demo', name: 'website', branch: 'main' };
  } else {
    const siteDir = path.join(ROOT, 'sites', site);
    const opts = JSON.parse(await readFile(path.join(siteDir, 'demo.json'), 'utf8'));
    const repoDir = path.resolve(ROOT, repo || opts.repoDir);
    const src = path.join(repoDir, opts.siteDir);
    if (!existsSync(src)) throw new Error(`Website niet gevonden in ${src}. Geef de map van de repository op met --repo <pad>.`);
    const skip = new Set((opts.skip || []).map((p) => path.join(src, p)));
    // De website zelf (alleen lezen uit de andere repository; daar verandert niets)
    await cp(src, WEB, { recursive: true, filter: (f) => !skip.has(f) && !path.basename(f).startsWith('.') });
    await cp(path.join(ROOT, 'admin'), path.join(WEB, 'admin'), { recursive: true });
    seed = await seedFrom(repoDir, opts.contentDirs || ['content']);
    cfg = JSON.parse(await readFile(path.join(siteDir, 'config.json'), 'utf8'));
    cfg.repo = { owner: 'demo', name: site, branch: 'main' };
    if (cfg.preview) {
      // Bouwscript van de website naast het beheer, en het inhoudsbestand van de
      // demo-website laten kijken of het beheer in deze browser iets heeft gewijzigd.
      await copyFile(path.join(siteDir, cfg.preview.builder), path.join(WEB, 'admin', cfg.preview.builder));
      const target = path.join(WEB, ...cfg.preview.path.split('/').filter(Boolean));
      const key = `cms-demo-voorbeeld-${cfg.repo.name}`;
      const extra = `\n/* DEMO: toon wat in het beheer (in deze browser) is opgeslagen. */\n`
        + `try { var cmsDemo = localStorage.getItem(${JSON.stringify(key)}); if (cmsDemo) window[${JSON.stringify(cfg.preview.global)}] = JSON.parse(cmsDemo); } catch (e) {}\n`;
      await writeFile(target, (await readFile(target, 'utf8')) + extra);
    }
    if (existsSync(path.join(siteDir, 'LEESMIJ.txt'))) leesmij = path.join(siteDir, 'LEESMIJ.txt');
  }

  await writeFile(path.join(WEB, 'admin/demo-seed.json'), JSON.stringify(seed));
  Object.assign(cfg, { demo: true, mock: true, mockToken: 'demo', siteUrl: '', auth: { oauthUrl: '' } });
  await writeFile(path.join(WEB, 'admin/config.json'), JSON.stringify(cfg, null, 2) + '\n');

  for (const f of ['Start-demo.cmd', 'server.ps1']) await copyFile(path.join(ROOT, 'demo', f), path.join(DIR, f));
  await copyFile(leesmij, path.join(DIR, 'LEESMIJ.txt'));

  const ZIP = path.join(DIST, name + '.zip');
  if (zip) {
    if (process.platform === 'win32') {
      execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${DIR}' -DestinationPath '${ZIP}' -Force`], { stdio: 'inherit' });
    } else {
      execFileSync('zip', ['-qr', ZIP, name], { cwd: DIST, stdio: 'inherit' });
    }
  }
  return { dir: DIR, web: WEB, zip: ZIP };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const noZip = process.argv.includes('--geen-zip');
  const r = await makeDemo({ zip: !noZip });
  console.log(noZip ? `Klaar: ${path.relative(ROOT, r.dir)}` : `Klaar: ${path.relative(ROOT, r.zip)}`);
}
