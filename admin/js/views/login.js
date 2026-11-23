// Dit scherm wordt alleen getoond als Cloudflare Access niet is ingesteld.
import { h, WEBCRAFT_URL } from '../ui.js';

export function loginView({ error }) {
  return {
    el: h('div', { class: 'login-screen' },
      h('div', { class: 'login-head' },
        h('img', { src: 'img/webcraft.svg', alt: '', width: 64, height: 64 }),
        h('h1', { class: 'wordmark' }, 'Web', h('span', {}, 'craft'))),
      h('main', { class: 'login-card', 'aria-label': 'Inloggen' },
        h('h2', {}, 'Inloggen via Cloudflare'),
        h('p', {}, error || 'Open het beheer via de beveiligde Cloudflare Access-link van deze website.'),
        h('p', { class: 'small muted' }, 'Cloudflare vraagt om je e-mailadres en stuurt daarna een eenmalige code.')),
      h('div', { class: 'login-below small' },
        h('p', { class: 'login-back' }, h('a', { href: '../' }, '← Terug naar de website')),
        h('a', { class: 'login-webcraft', href: WEBCRAFT_URL, target: '_blank', rel: 'noopener' },
          h('img', { src: 'img/webcraft.svg', alt: '', width: 16, height: 16 }), 'Over Webcraft'))),
  };
}
