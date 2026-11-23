// Volgt of de website (via GitHub Actions) opnieuw online is gezet
// na de laatste wijziging, en toont dat bovenin de beheeromgeving.

export const STATES = {
  idle: { label: 'Alles opgeslagen', cls: 'ok' },
  saving: { label: 'Bezig met opslaan…', cls: 'busy' },
  waiting: { label: 'Opgeslagen · wacht op publicatie…', cls: 'busy' },
  building: { label: 'Website wordt bijgewerkt…', cls: 'busy' },
  live: { label: 'Staat online', cls: 'ok' },
  failed: { label: 'Online zetten mislukt', cls: 'error' },
  saved: { label: 'Opgeslagen in GitHub', cls: 'ok' },
  noPages: { label: 'Opgeslagen · publicatie staat uit', cls: 'warn' },
  handedOff: { label: 'Opgeslagen · Cloudflare zet het online', cls: 'ok' },
  local: { label: 'Opgeslagen op deze pc', cls: 'ok' },
  kv: { label: 'Opgeslagen · staat meteen online', cls: 'ok' },
};

export class PublishTracker extends EventTarget {
  /**
   * @param {object} client GitHubClient
   * @param {object} [opts]
   * @param {string} [opts.hosting] "github-pages" (standaard), "cloudflare" of "local" (op je eigen pc)
   */
  constructor(client, { hosting = 'github-pages' } = {}) {
    super();
    this.client = client;
    this.hosting = hosting;
    this.state = 'idle';
    this.run = null;
    this.timer = null;
    this.actionsReadable = true;
    this.pagesEnabled = null; // null = onbekend, false = GitHub Pages staat uit
  }

  set(state, run = this.run) {
    this.state = state;
    this.run = run;
    this.dispatchEvent(new CustomEvent('change', { detail: { state, run } }));
  }

  stop() { clearTimeout(this.timer); this.timer = null; }

  /** Begin met volgen van de publicatie voor een bepaalde commit. */
  track(commitSha) {
    this.stop();
    this.commitSha = commitSha;
    this.started = Date.now();
    if (this.hosting === 'local' || this.hosting === 'kv') { this.set(this.hosting, null); return; }
    this.set('waiting', null);
    this.poll();
  }

  /** Bij het opstarten: toon de status van de meest recente publicatie. */
  async checkLatest(commitSha) {
    if (this.hosting === 'local' || this.hosting === 'kv') { this.set('idle', null); return; }
    try {
      const runs = await this.client.listWorkflowRuns({ headSha: commitSha, perPage: 5 });
      const run = pickRun(runs);
      if (!run) { this.set('idle', null); return; }
      if (run.status !== 'completed') { this.track(commitSha); return; }
      this.set(conclusionState(run, this.pagesEnabled, this.hosting), run);
    } catch {
      this.actionsReadable = false;
      this.set('idle', null);
    }
  }

  async poll() {
    const done = this.hosting === 'cloudflare' ? 'handedOff' : 'saved';
    if (!this.actionsReadable) { this.set(done, null); return; }
    let runs;
    try {
      runs = await this.client.listWorkflowRuns({ headSha: this.commitSha, perPage: 5 });
    } catch (e) {
      // Geen leesrechten voor Actions (bijv. token zonder "Actions: read"): we weten alleen dat het is opgeslagen.
      if (e.status === 403 || e.status === 404) { this.actionsReadable = false; this.set(done, null); return; }
      runs = [];
    }
    const run = pickRun(runs);
    const elapsed = Date.now() - this.started;
    if (!run) {
      if (elapsed > 90_000) { this.set(done, null); return; } // geen publicatie gestart
      this.set('waiting', null);
    } else if (run.status !== 'completed') {
      this.set('building', run);
    } else {
      this.set(conclusionState(run, this.pagesEnabled, this.hosting), run);
      return;
    }
    if (elapsed < 15 * 60_000) this.timer = setTimeout(() => this.poll(), elapsed < 60_000 ? 4000 : 10000);
  }
}

function pickRun(runs) {
  return runs.find((r) => /publiceren|pages|publish|deploy/i.test(r.name || '')) || runs[0] || null;
}

function conclusionState(run, pagesEnabled, hosting) {
  if (run.conclusion === 'success') {
    if (hosting === 'cloudflare') return 'handedOff';
    return pagesEnabled === false ? 'noPages' : 'live';
  }
  if (hosting === 'cloudflare' && (run.conclusion === 'skipped' || run.conclusion === 'neutral')) return 'handedOff';
  if (run.conclusion === 'skipped' || run.conclusion === 'neutral') return 'noPages';
  if (run.conclusion === 'cancelled') return 'saved';
  return 'failed';
}
