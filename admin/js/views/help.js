// Hulp: korte uitleg in gewone taal.

import { h } from '../ui.js';

export function helpView(ctx) {
  const repoUrl = `https://github.com/${ctx.config.repo.owner}/${ctx.config.repo.name}`;
  const q = (title, ...body) => h('details', { class: 'faq' }, h('summary', {}, title), h('div', {}, ...body));
  return {
    el: h('div', { class: 'view' },
      h('div', { class: 'view-header' }, h('h1', {}, 'Hulp')),
      h('div', { class: 'card prose' },
        q('Hoe zet ik iets op de website?',
          h('p', {}, 'Ga naar Pagina’s of Berichten, klik op "Nieuw toevoegen", vul een titel en tekst in en klik op "Opslaan en online zetten". Na ongeveer een minuut staat het op de website.')),
        q('Wat is een concept?',
          h('p', {}, 'Een concept is opgeslagen, maar staat niet op de website. Zo kun je rustig aan iets werken. Klik op "Opslaan en online zetten" als het klaar is.'),
          h('p', {}, 'Let op: als de repository openbaar is, kan iemand die daar zoekt een concept wel lezen. Zet er dus geen geheime informatie in.')),
        q('Wat is het verschil tussen een pagina en een bericht?',
          h('p', {}, 'Een pagina is vaste informatie, zoals "Over ons" of "Contact", en kan in het menu staan. Een bericht is nieuws met een datum en verschijnt in het berichtenoverzicht.')),
        q('Hoe voeg ik een foto toe?',
          h('p', {}, 'In de tekst: klik in de werkbalk op "Foto". Je kunt een bestaande foto kiezen of een nieuwe uploaden. Alle foto’s vind je ook onder "Foto’s" in het menu.')),
        q('Wat betekent de status bovenin?',
          h('ul', {},
            h('li', {}, h('strong', {}, 'Opgeslagen · wacht op publicatie'), ': je wijziging staat veilig in GitHub, de website wordt zo bijgewerkt.'),
            h('li', {}, h('strong', {}, 'Website wordt bijgewerkt'), ': GitHub is de website opnieuw aan het maken.'),
            h('li', {}, h('strong', {}, 'Staat online'), ': klaar, je wijziging is te zien.'),
            h('li', {}, h('strong', {}, 'Online zetten mislukt'), ': er ging iets mis. Klik op het bolletje voor details, of vraag hulp aan wie de website heeft ingericht.'),
            h('li', {}, h('strong', {}, 'Publicatie staat uit'), ': opgeslagen, maar GitHub Pages is (nog) niet aangezet voor deze repository.'))),
        q('Kan ik iets terugdraaien?',
          h('p', {}, 'Elke opslag is een "commit" in GitHub. Daar is alles terug te vinden en terug te zetten: ', h('a', { href: repoUrl + '/commits', target: '_blank', rel: 'noopener' }, 'bekijk de geschiedenis op GitHub'), '.')),
        q('Wie kan hier inloggen?',
          h('p', {}, 'Alleen mensen met een GitHub-account die schrijfrechten hebben op de repository. Anderen zien wel deze inlogpagina, maar kunnen niets lezen of wijzigen.')),
      )),
  };
}
