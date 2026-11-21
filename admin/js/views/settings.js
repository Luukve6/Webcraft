// Instellingen van de website (content/site.json).

import { h, toast, field, setFieldError } from '../ui.js';
import { ConflictError } from '../lib/github.js';
import { phoneHref, normalizePostcode, normalizeWebUrl, isEmail, SOCIALS } from '../lib/content.js';

export function settingsView(ctx) {
  const { store } = ctx;
  const s = store.site;
  let dirty = false;
  const unsaved = h('span', { class: 'badge badge-unsaved', hidden: true }, 'Niet opgeslagen wijzigingen');
  const mark = () => { if (!dirty) { dirty = true; unsaved.hidden = false; } };
  const text = (value, attrs = {}) => h('input', { type: 'text', value: value || '', oninput: mark, ...attrs });

  const title = text(s.title, { maxlength: 120 });
  const description = h('textarea', { rows: 2, oninput: mark, maxlength: 300 }, s.description);
  // Bewust type "text": met type "url" weigert de browser stilletjes "www.mijnwebsite.nl" zonder https://
  const url = text(s.url, { inputmode: 'url', placeholder: 'https://www.mijnwebsite.nl' });
  const homepage = h('select', { onchange: mark },
    h('option', { value: '' }, '— Geen: toon de nieuwste berichten —'),
    store.list('pages').map((p) => h('option', { value: p.slug, selected: p.slug === s.homepage }, p.title + (p.status === 'published' ? '' : ' (concept)'))));
  if (!store.get('pages', s.homepage)) homepage.value = '';
  const blogTitle = text(s.blogTitle, { maxlength: 60 });
  const showBlog = h('input', { type: 'checkbox', checked: s.showBlogInMenu, onchange: mark });
  const postsOnHome = h('input', { type: 'number', min: 0, max: 20, value: String(s.postsOnHome), class: 'input-small', oninput: mark });
  const footer = text(s.footer, { maxlength: 200 });

  // Contactgegevens
  const address = text(s.address, { maxlength: 100, autocomplete: 'street-address' });
  const postcode = text(s.postcode, { maxlength: 10, class: 'input-small', autocomplete: 'postal-code' });
  const city = text(s.city, { maxlength: 60, autocomplete: 'address-level2' });
  const phone = text(s.phone, { maxlength: 30, inputmode: 'tel', autocomplete: 'tel' });
  const email = text(s.email, { maxlength: 120, inputmode: 'email', autocomplete: 'email' });
  const socialInputs = Object.fromEntries(SOCIALS.map((x) => [x.key, text(s[x.key], { inputmode: 'url', placeholder: `${x.host}/...` })]));

  const fields = {
    title: field({ label: 'Naam van de website', input: title }),
    url: field({ label: 'Adres van de website', input: url, optional: true, help: 'Het adres waarop de website online staat, bijv. www.mijnwebsite.nl. Wordt gebruikt voor de knop "Website bekijken" en voor de sitemap.' }),
    postcode: field({ label: 'Postcode', input: postcode, optional: true }),
    phone: field({ label: 'Telefoonnummer', input: phone, optional: true, help: 'Zoals het op de website moet staan, bijv. 0318 12 34 56. Bezoekers op een telefoon kunnen erop tikken om te bellen.' }),
    email: field({ label: 'E-mailadres', input: email, optional: true }),
  };
  for (const x of SOCIALS) fields[x.key] = field({ label: x.label, input: socialInputs[x.key], optional: true, help: `Bijv. ${x.host}/uwbedrijf (https:// mag u weglaten).` });

  const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Opslaan en online zetten');

  /** Controleert alles; zet meldingen bij de velden en geeft de schone waarden terug (of null). */
  function collect() {
    Object.values(fields).forEach((f) => setFieldError(f, ''));
    const errors = [];
    const fail = (key, msg) => { setFieldError(fields[key], msg); errors.push(key); };

    if (!title.value.trim()) fail('title', 'Vul de naam van de website in.');
    const siteUrl = normalizeWebUrl(url.value);
    if (siteUrl === null) fail('url', 'Dit is geen geldig webadres. Bijvoorbeeld: www.mijnwebsite.nl');
    const pc = normalizePostcode(postcode.value);
    const phoneText = phone.value.trim().replace(/\s+/g, ' ');
    if (phoneText && !phoneHref(phoneText)) fail('phone', 'Dit lijkt geen telefoonnummer. Bijvoorbeeld: 0318 12 34 56');
    const mail = email.value.trim();
    if (mail && !isEmail(mail)) fail('email', 'Dit is geen geldig e-mailadres. Bijvoorbeeld: info@mijnbedrijf.nl');
    const socials = {};
    for (const x of SOCIALS) {
      const v = normalizeWebUrl(socialInputs[x.key].value, x.host);
      if (v === null) fail(x.key, `Vul een adres van ${x.label} in, bijv. ${x.host}/uwbedrijf`);
      else socials[x.key] = v;
    }

    if (errors.length) {
      const first = fields[errors[0]].querySelector('input, textarea, select');
      first.focus();
      first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      toast(errors.length === 1 ? 'Er klopt één veld nog niet. Kijk bij de rode melding.' : `Er kloppen ${errors.length} velden nog niet. Kijk bij de rode meldingen.`, 'error');
      return null;
    }
    // Laat meteen de nette versie zien
    postcode.value = pc;
    if (siteUrl) url.value = siteUrl.replace(/\/$/, '');
    for (const x of SOCIALS) socialInputs[x.key].value = socials[x.key];

    return {
      ...s,
      title: title.value.trim(),
      description: description.value.trim(),
      url: siteUrl ? siteUrl.replace(/\/$/, '') : '',
      homepage: homepage.value,
      blogTitle: blogTitle.value.trim() || 'Nieuws',
      showBlogInMenu: showBlog.checked,
      postsOnHome: parseInt(postsOnHome.value, 10) || 0,
      footer: footer.value.trim(),
      address: address.value.trim(),
      postcode: pc,
      city: city.value.trim(),
      phone: phoneText,
      email: mail,
      ...socials,
    };
  }

  const form = h('form', { class: 'card form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const data = collect();
    if (!data) return;
    saveBtn.disabled = true;
    ctx.setSaving(true);
    try {
      await store.saveSite(data);
      dirty = false;
      unsaved.hidden = true;
      toast('Instellingen opgeslagen. Over ongeveer een minuut staat het op de website.', 'success');
    } catch (e2) {
      toast(e2 instanceof ConflictError ? 'De instellingen zijn intussen elders gewijzigd. Klik op "Vernieuwen" en probeer opnieuw.' : 'Opslaan mislukt: ' + e2.message, 'error', 10000);
    } finally {
      saveBtn.disabled = false;
      ctx.setSaving(false);
    }
  } },
  h('h2', {}, 'Algemeen'),
  fields.title,
  field({ label: 'Korte omschrijving', input: description, optional: true, help: 'Wordt gebruikt door zoekmachines.' }),
  fields.url,
  h('h2', {}, 'Contactgegevens'),
  h('p', { class: 'field-help' }, 'Wat u hier invult, staat onderaan elke pagina van de website. Lege velden worden niet getoond.'),
  field({ label: 'Straat en huisnummer', input: address, optional: true }),
  h('div', { class: 'field-row' }, fields.postcode, field({ label: 'Plaats', input: city, optional: true })),
  fields.phone,
  fields.email,
  h('h2', {}, 'Sociale media'),
  ...SOCIALS.map((x) => fields[x.key]),
  h('h2', {}, 'Homepagina en nieuws'),
  field({ label: 'Homepagina', input: homepage, help: 'Welke pagina bezoekers als eerste zien.' }),
  field({ label: 'Naam van het berichtenoverzicht', input: blogTitle, help: 'Bijvoorbeeld "Nieuws" of "Blog".' }),
  h('label', { class: 'check' }, showBlog, ' Berichtenoverzicht in het menu tonen'),
  field({ label: 'Aantal nieuwste berichten op de homepagina', input: postsOnHome, help: '0 = geen berichten tonen.' }),
  h('h2', {}, 'Onderkant van de pagina'),
  field({ label: 'Tekst onderaan elke pagina', input: footer, optional: true, help: 'Leeg laten = © jaartal en naam van de website.' }),
  h('div', { class: 'btn-row' }, saveBtn, unsaved));

  return {
    el: h('div', { class: 'view' }, h('div', { class: 'view-header' }, h('h1', {}, 'Instellingen')), form),
    canLeave: () => !dirty,
  };
}
