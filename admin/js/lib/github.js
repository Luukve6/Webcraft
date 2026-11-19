// Koppeling met de GitHub REST API.
// Alle wijzigingen worden als echte commits in de repository gezet via de
// Git Data API (blobs -> tree -> commit -> branch bijwerken). Zo komen
// meerdere bestanden (bijv. tekst + foto, of hernoemen = verwijderen + nieuw)
// in één commit terecht.
//
// Deze module gebruikt alleen fetch, atob/btoa en TextEncoder/TextDecoder,
// zodat hij zowel in de browser als in Node.js (tests) werkt.

export class GitHubError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.details = details;
  }
}

export class ConflictError extends Error {
  constructor(paths) {
    super('Iemand anders heeft dit intussen gewijzigd.');
    this.name = 'ConflictError';
    this.paths = paths;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function utf8ToBytes(text) { return encoder.encode(text); }
export function bytesToUtf8(bytes) { return decoder.decode(bytes); }

function friendlyMessage(status, body) {
  if (status === 401) return 'Je bent niet (meer) ingelogd bij GitHub. Log opnieuw in.';
  if (status === 403 && /rate limit/i.test(body?.message || '')) return 'GitHub heeft tijdelijk te veel verzoeken ontvangen. Probeer het over een paar minuten opnieuw.';
  if (status === 403) return 'Je hebt geen toestemming voor deze actie in GitHub.';
  if (status === 404) return 'Niet gevonden in GitHub (of je hebt geen toegang tot deze repository).';
  if (status === 409) return 'De repository is leeg of in gebruik. Probeer het opnieuw.';
  if (status === 422) return 'GitHub kon de wijziging niet verwerken.';
  if (status >= 500) return 'GitHub is even niet bereikbaar. Probeer het later opnieuw.';
  return body?.message || `Onbekende fout van GitHub (${status}).`;
}

export class GitHubClient {
  /**
   * @param {object} opts
   * @param {string} opts.token   Toegangssleutel van de ingelogde gebruiker (nooit in de code!)
   * @param {string} opts.owner
   * @param {string} opts.repo
   * @param {string} [opts.branch]
   * @param {string} [opts.apiBase]
   * @param {Function} [opts.fetch]
   */
  constructor({ token, owner, repo, branch = 'main', apiBase = 'https://api.github.com', fetch: fetchImpl } = {}) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.apiBase = apiBase.replace(/\/$/, '');
    this.fetch = fetchImpl || ((...a) => globalThis.fetch(...a));
    this.blobCache = new Map();
  }

  get repoPath() {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  async request(method, path, body) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await this.fetch(this.apiBase + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch (e) {
      throw new GitHubError('Geen verbinding met GitHub. Controleer je internetverbinding.', 0, e);
    }
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { message: text }; }
    }
    if (!res.ok) throw new GitHubError(friendlyMessage(res.status, data), res.status, data);
    return data;
  }

  // ---------- Gebruiker en repository ----------

  getUser() { return this.request('GET', '/user'); }

  getRepo() { return this.request('GET', this.repoPath); }

  /** Controleert of de ingelogde gebruiker mag schrijven in de repository. */
  async checkAccess() {
    const [user, repo] = await Promise.all([this.getUser(), this.getRepo()]);
    const canWrite = Boolean(repo.permissions && (repo.permissions.push || repo.permissions.admin || repo.permissions.maintain));
    return { user, repo, canWrite };
  }

  // ---------- Lezen ----------

  async getHead() {
    const ref = await this.request('GET', `${this.repoPath}/git/ref/heads/${encodeURIComponent(this.branch)}`);
    const commitSha = ref.object.sha;
    const commit = await this.request('GET', `${this.repoPath}/git/commits/${commitSha}`);
    return { commitSha, treeSha: commit.tree.sha };
  }

  /** Alle bestanden in de repository (pad -> sha). */
  async getTree(treeSha) {
    const data = await this.request('GET', `${this.repoPath}/git/trees/${treeSha}?recursive=1`);
    const files = new Map();
    for (const e of data.tree || []) {
      if (e.type === 'blob') files.set(e.path, { sha: e.sha, size: e.size ?? 0 });
    }
    return { files, truncated: Boolean(data.truncated) };
  }

  /** Haalt de inhoud van een bestand op aan de hand van de sha (wordt gecachet). */
  async getBlobBytes(sha) {
    if (this.blobCache.has(sha)) return this.blobCache.get(sha);
    const data = await this.request('GET', `${this.repoPath}/git/blobs/${sha}`);
    const bytes = data.encoding === 'base64' ? base64ToBytes(data.content) : utf8ToBytes(data.content);
    this.blobCache.set(sha, bytes);
    return bytes;
  }

  async getBlobText(sha) {
    return bytesToUtf8(await this.getBlobBytes(sha));
  }

  /** Laatste commits (voor "Recente wijzigingen" op het dashboard). */
  listCommits(perPage = 8) {
    return this.request('GET', `${this.repoPath}/commits?sha=${encodeURIComponent(this.branch)}&per_page=${perPage}`);
  }

  /** Publicatieruns van GitHub Actions. */
  async listWorkflowRuns({ headSha, perPage = 5 } = {}) {
    let q = `?branch=${encodeURIComponent(this.branch)}&per_page=${perPage}`;
    if (headSha) q += `&head_sha=${headSha}`;
    const data = await this.request('GET', `${this.repoPath}/actions/runs${q}`);
    return data.workflow_runs || [];
  }

  /** Staat GitHub Pages aan? true / false / null (onbekend). */
  async getPagesEnabled() {
    try {
      await this.request('GET', `${this.repoPath}/pages`);
      return true;
    } catch (e) {
      if (e.status === 404) return false;
      return null;
    }
  }

  // ---------- Schrijven ----------

  /**
   * Zet een of meer wijzigingen in één commit.
   * @param {object} opts
   * @param {string} opts.message  Omschrijving van de wijziging
   * @param {Array<{path:string, content?:string|Uint8Array, delete?:boolean}>} opts.changes
   * @param {Object<string,string|null>} [opts.expected]  Verwachte sha per pad (null = mag nog niet bestaan).
   *        Wijkt de huidige versie af, dan volgt een ConflictError (iemand anders was sneller).
   * @returns {Promise<{commitSha:string, treeSha:string, shas:Object<string,string|null>}>}
   */
  async commit({ message, changes, expected = {} }) {
    if (!changes || !changes.length) throw new Error('Er is niets om op te slaan.');

    // 1. Blobs maken (los van de branch, kan dus vooraf)
    const shas = {};
    const treeEntries = [];
    for (const ch of changes) {
      if (ch.delete) {
        treeEntries.push({ path: ch.path, mode: '100644', type: 'blob', sha: null });
        shas[ch.path] = null;
        continue;
      }
      const bytes = typeof ch.content === 'string' ? utf8ToBytes(ch.content) : ch.content;
      const blob = await this.request('POST', `${this.repoPath}/git/blobs`, {
        content: bytesToBase64(bytes),
        encoding: 'base64',
      });
      this.blobCache.set(blob.sha, bytes);
      shas[ch.path] = blob.sha;
      treeEntries.push({ path: ch.path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    // 2. Tree + commit op de nieuwste versie van de branch; bij een race opnieuw proberen
    for (let attempt = 0; attempt < 3; attempt++) {
      const head = await this.getHead();

      const expectedPaths = Object.keys(expected);
      // Verwijderen van iets dat al weg is: niet meesturen (GitHub geeft dan een fout)
      let entries = treeEntries;
      if (expectedPaths.length || entries.some((e) => e.sha === null)) {
        const { files } = await this.getTree(head.treeSha);
        const conflicts = expectedPaths.filter((p) => {
          const current = files.get(p)?.sha ?? null;
          return current !== expected[p];
        });
        if (conflicts.length) throw new ConflictError(conflicts);
        entries = treeEntries.filter((e) => e.sha !== null || files.has(e.path));
        if (!entries.length) return { commitSha: head.commitSha, treeSha: head.treeSha, shas };
      }

      const tree = await this.request('POST', `${this.repoPath}/git/trees`, {
        base_tree: head.treeSha,
        tree: entries,
      });
      const commit = await this.request('POST', `${this.repoPath}/git/commits`, {
        message,
        tree: tree.sha,
        parents: [head.commitSha],
      });
      try {
        await this.request('PATCH', `${this.repoPath}/git/refs/heads/${encodeURIComponent(this.branch)}`, {
          sha: commit.sha,
          force: false,
        });
        return { commitSha: commit.sha, treeSha: tree.sha, shas };
      } catch (e) {
        // 422 = branch is intussen verder gegaan (geen fast-forward). Opnieuw proberen.
        if (e instanceof GitHubError && e.status === 422 && attempt < 2) continue;
        throw e;
      }
    }
    throw new GitHubError('Opslaan is niet gelukt omdat de repository steeds wijzigde. Probeer het opnieuw.', 409);
  }
}
