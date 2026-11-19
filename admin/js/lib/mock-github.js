// Nagebootste GitHub API (alleen voor testen en de demoversie).
// Implementeert precies de onderdelen van de GitHub REST API die het CMS
// gebruikt, met een opslag in het geheugen. Zo kun je de beheeromgeving
// volledig uitproberen zonder echte GitHub-account en zonder echte commits.
//
// Werkt zowel in Node (tests, `npm run dev`) als in de browser (demoversie),
// want het gebruikt alleen Uint8Array, TextEncoder en eigen SHA-1.

import { bytesToBase64, base64ToBytes, utf8ToBytes } from './github.js';

/** SHA-1 als hex (klein en synchroon; alleen voor nagebootste ids). */
export function sha1(input) {
  const msg = typeof input === 'string' ? utf8ToBytes(input) : input;
  const len = msg.length;
  const words = new Uint32Array((((len + 8) >> 6) + 1) * 16);
  for (let i = 0; i < len; i++) words[i >> 2] |= msg[i] << (24 - (i % 4) * 8);
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  words[words.length - 1] = len * 8;
  words[words.length - 2] = Math.floor((len * 8) / 0x100000000);
  let [a0, b0, c0, d0, e0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  const rotl = (x, n) => (x << n) | (x >>> (32 - n));
  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[i + t];
    for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let [a, b, c, d, e] = [a0, b0, c0, d0, e0];
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const tmp = (rotl(a, 5) + f + e + k + w[t]) >>> 0;
      e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = tmp;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0; e0 = (e0 + e) >>> 0;
  }
  return [a0, b0, c0, d0, e0].map((x) => x.toString(16).padStart(8, '0')).join('');
}

const toBytes = (x) => (typeof x === 'string' ? utf8ToBytes(x) : new Uint8Array(x));

export function createMockGitHub({
  owner = 'demo',
  repo = 'website',
  branch = 'main',
  token = 'lokale-test',
  login = 'testgebruiker',
  canWrite = true,
  pagesEnabled = true,
  seed = new Map(), // pad -> bytes (Uint8Array/Buffer) of tekst
  onChange = null, // (bestanden: Map) => void, na elke opslag
  onChangeRequired = false, // true: mislukt onChange, dan mislukt de opslag ook
} = {}) {
  const blobs = new Map(); // sha -> Uint8Array
  const trees = new Map(); // sha -> Map(pad -> blobSha)
  const commits = new Map(); // sha -> { tree, parents, message, date }
  const refs = new Map();
  const runs = [];

  function putBlob(bytes) {
    const head = utf8ToBytes(`blob ${bytes.length}\0`);
    const all = new Uint8Array(head.length + bytes.length);
    all.set(head); all.set(bytes, head.length);
    const sha = sha1(all);
    blobs.set(sha, bytes);
    return sha;
  }
  function putTree(map) {
    const sorted = [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    const sha = sha1('tree' + JSON.stringify(sorted));
    trees.set(sha, new Map(sorted));
    return sha;
  }
  function putCommit(tree, parents, message) {
    const date = new Date().toISOString();
    const sha = sha1('commit' + JSON.stringify({ tree, parents, message, date, n: commits.size }));
    commits.set(sha, { tree, parents, message, date });
    return sha;
  }

  // Beginsituatie
  const initial = new Map();
  for (const [p, data] of seed) initial.set(p, putBlob(toBytes(data)));
  refs.set(branch, putCommit(putTree(initial), [], 'Eerste versie'));

  const base = `/repos/${owner}/${repo}`;

  function json(status, body) {
    return new Response(body === undefined ? '' : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function files() {
    const tree = trees.get(commits.get(refs.get(branch)).tree);
    const out = new Map();
    for (const [p, sha] of tree) out.set(p, blobs.get(sha));
    return out;
  }

  async function handle(method, url, headers, bodyText) {
    const auth = headers.authorization || headers.Authorization || '';
    if (auth !== `Bearer ${token}`) return json(401, { message: 'Bad credentials' });
    const u = new URL(url, 'http://mock');
    const p = u.pathname.replace(/^\/__mock_github/, '');
    const body = bodyText ? JSON.parse(bodyText) : undefined;
    let m;

    if (method === 'GET' && p === '/user') {
      return json(200, { login, name: 'Test Gebruiker', avatar_url: '' });
    }
    if (method === 'GET' && p === base) {
      return json(200, {
        full_name: `${owner}/${repo}`, private: true, default_branch: branch,
        html_url: `https://github.com/${owner}/${repo}`,
        permissions: { admin: false, push: canWrite, pull: true },
      });
    }
    if (method === 'GET' && p === `${base}/pages`) {
      return pagesEnabled ? json(200, { html_url: `https://${owner}.github.io/${repo}/`, status: 'built' }) : json(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = p.match(new RegExp(`^${base}/git/ref/heads/(.+)$`)))) {
      const sha = refs.get(decodeURIComponent(m[1]));
      return sha ? json(200, { object: { sha, type: 'commit' } }) : json(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = p.match(new RegExp(`^${base}/git/commits/([0-9a-f]+)$`)))) {
      const c = commits.get(m[1]);
      return c ? json(200, { sha: m[1], tree: { sha: c.tree }, message: c.message }) : json(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = p.match(new RegExp(`^${base}/git/trees/([0-9a-f]+)$`)))) {
      const t = trees.get(m[1]);
      if (!t) return json(404, { message: 'Not Found' });
      const tree = [...t.entries()].map(([path, sha]) => ({ path, sha, type: 'blob', mode: '100644', size: blobs.get(sha).length }));
      return json(200, { sha: m[1], tree, truncated: false });
    }
    if (method === 'GET' && (m = p.match(new RegExp(`^${base}/git/blobs/([0-9a-f]+)$`)))) {
      const b = blobs.get(m[1]);
      return b ? json(200, { sha: m[1], encoding: 'base64', content: bytesToBase64(b), size: b.length }) : json(404, { message: 'Not Found' });
    }
    if (method === 'POST' && p === `${base}/git/blobs`) {
      if (!canWrite) return json(403, { message: 'Resource not accessible' });
      const bytes = body.encoding === 'base64' ? base64ToBytes(body.content) : utf8ToBytes(body.content);
      return json(201, { sha: putBlob(bytes) });
    }
    if (method === 'POST' && p === `${base}/git/trees`) {
      const baseTree = trees.get(body.base_tree);
      if (!baseTree) return json(422, { message: 'base_tree not found' });
      const map = new Map(baseTree);
      for (const e of body.tree) {
        if (e.sha === null) {
          if (!map.has(e.path)) return json(422, { message: `path ${e.path} not in tree` });
          map.delete(e.path);
        } else {
          if (!blobs.has(e.sha)) return json(422, { message: 'blob not found' });
          map.set(e.path, e.sha);
        }
      }
      return json(201, { sha: putTree(map) });
    }
    if (method === 'POST' && p === `${base}/git/commits`) {
      if (!trees.has(body.tree)) return json(422, { message: 'tree not found' });
      return json(201, { sha: putCommit(body.tree, body.parents, body.message) });
    }
    if (method === 'PATCH' && (m = p.match(new RegExp(`^${base}/git/refs/heads/(.+)$`)))) {
      if (!canWrite) return json(403, { message: 'Resource not accessible' });
      const name = decodeURIComponent(m[1]);
      const current = refs.get(name);
      const c = commits.get(body.sha);
      if (!c) return json(422, { message: 'commit not found' });
      if (!body.force && !c.parents.includes(current)) return json(422, { message: 'Update is not a fast forward' });
      refs.set(name, body.sha);
      // Nagebootste publicatierun (wordt na een paar seconden "geslaagd")
      runs.unshift({ id: runs.length + 1, head_sha: body.sha, name: 'Website publiceren', status: 'in_progress', conclusion: null, created_at: new Date().toISOString(), html_url: '#', _t: Date.now() });
      if (onChange && name === branch) {
        try {
          await onChange(files());
        } catch (e) {
          if (onChangeRequired) {
            refs.set(name, current);
            runs.shift();
            return json(400, { message: e.message || 'Opslaan mislukt' });
          }
          /* bewaren is optioneel */
        }
      }
      return json(200, { object: { sha: body.sha } });
    }
    if (method === 'GET' && p === `${base}/commits`) {
      const out = [];
      let sha = refs.get(u.searchParams.get('sha') || branch);
      const max = Number(u.searchParams.get('per_page') || 30);
      while (sha && out.length < max) {
        const c = commits.get(sha);
        out.push({ sha, html_url: '#', commit: { message: c.message, author: { name: 'Test Gebruiker', date: c.date } }, author: { login } });
        sha = c.parents[0];
      }
      return json(200, out);
    }
    if (method === 'GET' && p === `${base}/actions/runs`) {
      for (const r of runs) {
        if (r.status !== 'completed' && Date.now() - r._t > 4000) { r.status = 'completed'; r.conclusion = 'success'; }
      }
      const headSha = u.searchParams.get('head_sha');
      const list = runs.filter((r) => !headSha || r.head_sha === headSha).map(({ _t, ...r }) => r);
      return json(200, { total_count: list.length, workflow_runs: list.slice(0, Number(u.searchParams.get('per_page') || 30)) });
    }
    return json(404, { message: `Mock: onbekend adres ${method} ${p}` });
  }

  /** fetch-compatibele functie. */
  async function fetch(url, init = {}) {
    return handle((init.method || 'GET').toUpperCase(), String(url), init.headers || {}, init.body);
  }

  function log() {
    const out = [];
    let sha = refs.get(branch);
    while (sha) { const c = commits.get(sha); out.push({ sha, message: c.message }); sha = c.parents[0]; }
    return out;
  }

  /** Simuleert een wijziging door iemand anders (voor conflicttests). */
  function externalCommit(path, content, message = 'Wijziging door iemand anders') {
    const head = refs.get(branch);
    const map = new Map(trees.get(commits.get(head).tree));
    if (content === null) map.delete(path); else map.set(path, putBlob(toBytes(content)));
    refs.set(branch, putCommit(putTree(map), [head], message));
  }

  return { fetch, handle, files, log, externalCommit, token, owner, repo, branch };
}
