// De versie linksonder in het beheer moet de echte versie zijn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VERSION } from '../admin/js/version.js';

test('versie in het beheer is gelijk aan package.json', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(VERSION, pkg.version);
});
