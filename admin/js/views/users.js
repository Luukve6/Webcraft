// Gebruikers (alleen bij opslag in Cloudflare, alleen voor admins): wie mag het beheer gebruiken.

import { h, fill, toast, field, deleteAction } from '../ui.js';
import { api } from '../local.js';

const ROLLEN = [['editor', 'Redacteur: kan alles aanpassen, behalve gebruikers'], ['admin', 'Admin: ook gebruikers beheren']];

export function usersView(ctx) {
  const me = ctx.user.login;
  let lijst = [];
  let dirty = false;
  const body = h('div', {}, h('p', { class: 'muted' }, 'Laden…'));

  const select = (value, onchange) => h('select', { onchange }, ROLLEN.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));

  function render() {
    const rows = lijst.map((u, i) => h('tr', {},
      h('td', { 'data-label': 'E-mailadres' }, u.email, u.email === me ? h('span', { class: 'muted small' }, ' (jij)') : null),
      h('td', { 'data-label': 'Rol' }, select(u.rol, (e) => { u.rol = e.target.value; dirty = true; })),
      h('td', { class: 'col-actions' }, u.email === me ? null
        : deleteAction(() => { lijst.splice(i, 1); dirty = true; render(); }, 'Verwijderen', { ariaLabel: `${u.email} verwijderen` }))));

    const email = h('input', { type: 'text', inputmode: 'email', autocomplete: 'off', placeholder: 'naam@voorbeeld.nl' });
    const rol = select('editor');
    const emailField = field({ label: 'E-mailadres', input: email });
    const add = (e) => {
      e.preventDefault();
      const v = email.value.trim().toLowerCase();
      emailField.querySelector('.field-error').hidden = true;
      const err = !/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(v) ? 'Vul een geldig e-mailadres in.' : lijst.some((u) => u.email === v) ? 'Deze persoon staat er al in.' : '';
      if (err) { const el = emailField.querySelector('.field-error'); el.textContent = err; el.hidden = false; email.focus(); return; }
      lijst.push({ email: v, rol: rol.value });
      dirty = true;
      render();
    };

    fill(body,
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'E-mailadres'), h('th', { scope: 'col' }, 'Rol'), h('th', { scope: 'col', class: 'col-actions' }, h('span', { class: 'sr-only' }, 'Acties')))),
        h('tbody', {}, rows)),
      h('form', { class: 'card form', onsubmit: add },
        h('h2', {}, 'Iemand toevoegen'),
        emailField,
        field({ label: 'Rol', input: rol }),
        h('p', { class: 'field-help' }, 'Let op: dit e-mailadres moet ook mogen inloggen in Cloudflare Access (Zero Trust > Access > Applications > dit beheer > Policies). Staat daar een hele domeinnaam toegestaan (bijv. @mijnbedrijf.nl), dan werkt het meteen. Inloggen gaat met een code die per e-mail komt.'),
        h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn' }, 'Toevoegen aan de lijst'))),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, 'Opslaan')));
  }

  async function save() {
    try {
      lijst = await api(ctx.config, 'gebruikers', { method: 'POST', body: { gebruikers: lijst } });
      dirty = false;
      toast('Gebruikers opgeslagen.', 'success');
      render();
    } catch (e) {
      toast('Opslaan mislukt: ' + e.message, 'error', 10000);
    }
  }

  api(ctx.config, 'gebruikers')
    .then((data) => { lijst = data; render(); })
    .catch((e) => fill(body, h('p', { class: 'notice-warn' }, 'Kon de gebruikers niet laden: ' + e.message)));

  return {
    el: h('div', { class: 'view' }, h('div', { class: 'view-header' }, h('h1', {}, 'Gebruikers')),
      h('p', { class: 'lead' }, 'Wie mag deze website aanpassen. Iedereen logt in met een code die per e-mail komt.'), body),
    canLeave: () => !dirty,
  };
}
