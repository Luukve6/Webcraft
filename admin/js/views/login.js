// Inlogscherm.

import { h, WEBCRAFT_URL } from '../ui.js';
import { loginWithOAuth } from '../auth.js';

/**
 * @param {object} opts
 * @param {object} opts.config
 * @param {(token:string, remember:boolean, method:string) => Promise<void>} opts.onToken
 * @param {string} [opts.error]
 */
export function loginView({ config, onToken, error }) {
  const remember = h('input', { type: 'checkbox', id: 'remember' });
  const errorBox = h('div', { class: 'notice notice-error', role: 'alert', hidden: !error }, error || '');
  const showError = (msg) => { errorBox.textContent = msg; errorBox.hidden = !msg; };

  const busy = (btn, on, label) => {
    btn.disabled = on;
    if (label) btn.textContent = label;
  };

  // Op deze pc (lokaal) geen GitHub-knop: de inlogdienst accepteert alleen het echte adres.
  const oauthBtn = config.auth?.oauthUrl && !config.localMode
    ? h('button', { type: 'button', class: 'btn btn-primary btn-block btn-large', onclick: async () => {
      showError('');
      busy(oauthBtn, true, 'Bezig met inloggen…');
      try {
        const token = await loginWithOAuth(config.auth.oauthUrl);
        await onToken(token, remember.checked, 'oauth');
      } catch (e) {
        showError(e.message);
      } finally {
        busy(oauthBtn, false, 'Inloggen met GitHub');
      }
    } }, 'Inloggen met GitHub')
    : null;

  const tokenInput = h('input', { type: 'password', id: 'login-key', autocomplete: 'off', spellcheck: 'false' });
  const eyeBtn = h('button', { type: 'button', class: 'pw-eye', 'aria-label': 'Sleutel tonen', 'aria-pressed': 'false', onclick: () => {
    const show = tokenInput.type === 'password';
    tokenInput.type = show ? 'text' : 'password';
    eyeBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
    eyeBtn.setAttribute('aria-label', show ? 'Sleutel verbergen' : 'Sleutel tonen');
  } }, eyeIcon());
  const tokenBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Inloggen');

  const tokenForm = h('form', { class: 'token-form', onsubmit: async (e) => {
    e.preventDefault();
    showError('');
    const token = tokenInput.value.trim();
    if (!token) { showError('Plak eerst je toegangssleutel.'); tokenInput.focus(); return; }
    busy(tokenBtn, true, 'Controleren…');
    try {
      await onToken(token, remember.checked, 'token');
      tokenInput.value = '';
    } catch (err) {
      showError(err.message);
    } finally {
      busy(tokenBtn, false, 'Inloggen');
    }
  } },
  h('div', { class: 'field' },
    h('label', { for: 'login-key' }, 'Toegangssleutel'),
    h('div', { class: 'pw-wrap' }, tokenInput, eyeBtn)),
  h('div', { class: 'login-row' },
    h('label', { class: 'check remember' }, remember, ' Ingelogd blijven'),
    tokenBtn));

  const mockNote = config.localMode
    ? h('div', { class: 'notice notice-info' },
      h('strong', {}, 'Op deze pc. '), 'Wat je opslaat komt in de bestanden op deze computer, niet in GitHub. ',
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => { tokenInput.value = config.mockToken || ''; tokenForm.requestSubmit(); } }, 'Inloggen op deze pc'))
    : config.mock
    ? h('div', { class: 'notice notice-info' },
      h('strong', {}, 'Testmodus. '), 'Er wordt niets echt in GitHub opgeslagen. ',
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => { tokenInput.value = config.mockToken || ''; tokenForm.requestSubmit(); } }, 'Inloggen als testgebruiker'),
      config.demo
        ? h('p', { class: 'small', style: 'margin:0;flex-basis:100%' }, 'Je wijzigingen blijven in deze browser bewaard. ',
          h('button', { type: 'button', class: 'btn btn-small', onclick: async () => {
            if (!confirm('Alle wijzigingen in de demo wissen en opnieuw beginnen?')) return;
            await (await import('../demo.js')).resetDemo(config);
            location.reload();
          } }, 'Demo opnieuw beginnen'))
        : null)
    : null;

  return {
    el: h('div', { class: 'login-screen' },
      h('div', { class: 'login-head' },
        h('img', { src: 'img/webcraft.svg', alt: '', width: 64, height: 64 }),
        h('h1', { class: 'wordmark' }, 'Web', h('span', {}, 'craft'))),
      h('main', { class: 'login-card', 'aria-label': 'Inloggen' },
        mockNote,
        errorBox,
        oauthBtn,
        oauthBtn ? h('div', { class: 'or' }, h('span', {}, 'of')) : null,
        oauthBtn ? h('details', { class: 'alt-login' }, h('summary', {}, 'Inloggen met een toegangssleutel'), tokenForm) : tokenForm),
      h('div', { class: 'login-below small' },
        h('p', { class: 'muted' }, 'Vink "Ingelogd blijven" alleen aan op je eigen computer.'),
        h('p', {}, h('a', { href: '../' }, '← Terug naar de website')),
        h('a', { class: 'login-webcraft', href: WEBCRAFT_URL, target: '_blank', rel: 'noopener', title: 'Over Webcraft (opent in een nieuw tabblad)' },
          h('img', { src: 'img/webcraft.svg', alt: '', width: 16, height: 16 }), 'Over Webcraft'))),
  };
}

function eyeIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M12 5C6.5 5 2.7 9.4 1.5 12c1.2 2.6 5 7 10.5 7s9.3-4.4 10.5-7C21.3 9.4 17.5 5 12 5zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z');
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

