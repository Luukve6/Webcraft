// Instellingen van de website (content/site.json).

import { h, toast, field } from '../ui.js';
import { ConflictError } from '../lib/github.js';

export function settingsView(ctx) {
  const { store } = ctx;
  const s = store.site;
  let dirty = false;
  const mark = () => { dirty = true; };

  const title = h('input', { type: 'text', value: s.title, oninput: mark, maxlength: 120 });
  const description = h('textarea', { rows: 2, oninput: mark, maxlength: 300 }, s.description);
  const url = h('input', { type: 'url', value: s.url, oninput: mark, placeholder: 'https://www.mijnwebsite.nl' });
  const homepage = h('select', { onchange: mark },
    h('option', { value: '' }, '— Geen: toon de nieuwste berichten —'),
    store.list('pages').map((p) => h('option', { value: p.slug, selected: p.slug === s.homepage }, p.title + (p.status === 'published' ? '' : ' (concept)'))));
  if (!store.get('pages', s.homepage)) homepage.value = '';
  const blogTitle = h('input', { type: 'text', value: s.blogTitle, oninput: mark, maxlength: 60 });
  const showBlog = h('input', { type: 'checkbox', checked: s.showBlogInMenu, onchange: mark });
  const postsOnHome = h('input', { type: 'number', min: 0, max: 20, value: String(s.postsOnHome), class: 'input-small', oninput: mark });
  const footer = h('input', { type: 'text', value: s.footer, oninput: mark, maxlength: 200 });

  const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Opslaan en online zetten');

  const form = h('form', { class: 'card form', onsubmit: async (e) => {
    e.preventDefault();
    if (!title.value.trim()) { toast('Vul de naam van de website in.', 'error'); title.focus(); return; }
    saveBtn.disabled = true;
    ctx.setSaving(true);
    try {
      await store.saveSite({
        ...s,
        title: title.value.trim(),
        description: description.value.trim(),
        url: url.value.trim().replace(/\/$/, ''),
        homepage: homepage.value,
        blogTitle: blogTitle.value.trim() || 'Nieuws',
        showBlogInMenu: showBlog.checked,
        postsOnHome: parseInt(postsOnHome.value, 10) || 0,
        footer: footer.value.trim(),
      });
      dirty = false;
      toast('Instellingen opgeslagen.', 'success');
    } catch (e2) {
      toast(e2 instanceof ConflictError ? 'De instellingen zijn intussen elders gewijzigd. Klik op "Vernieuwen" en probeer opnieuw.' : 'Opslaan mislukt: ' + e2.message, 'error', 10000);
    } finally {
      saveBtn.disabled = false;
      ctx.setSaving(false);
    }
  } },
  h('h2', {}, 'Algemeen'),
  field({ label: 'Naam van de website', input: title }),
  field({ label: 'Korte omschrijving', input: description, optional: true, help: 'Wordt gebruikt door zoekmachines.' }),
  field({ label: 'Adres van de website', input: url, optional: true, help: 'Het adres waarop de website online staat. Wordt gebruikt voor de knop "Website bekijken" en voor de sitemap.' }),
  h('h2', {}, 'Homepagina en nieuws'),
  field({ label: 'Homepagina', input: homepage, help: 'Welke pagina bezoekers als eerste zien.' }),
  field({ label: 'Naam van het berichtenoverzicht', input: blogTitle, help: 'Bijvoorbeeld "Nieuws" of "Blog".' }),
  h('label', { class: 'check' }, showBlog, ' Berichtenoverzicht in het menu tonen'),
  field({ label: 'Aantal nieuwste berichten op de homepagina', input: postsOnHome, help: '0 = geen berichten tonen.' }),
  h('h2', {}, 'Onderkant van de pagina'),
  field({ label: 'Tekst onderaan elke pagina', input: footer, optional: true, help: 'Leeg laten = © jaartal en naam van de website.' }),
  h('div', { class: 'btn-row' }, saveBtn));

  return {
    el: h('div', { class: 'view' }, h('div', { class: 'view-header' }, h('h1', {}, 'Instellingen')), form),
    canLeave: () => !dirty,
  };
}
