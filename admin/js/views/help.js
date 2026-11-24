// Hulp: korte uitleg in gewone taal.

import { h, WEBCRAFT_URL } from '../ui.js';

export function helpView() {
  const q = (title, ...body) => h('details', { class: 'faq' }, h('summary', {}, title), h('div', {}, ...body));
  return {
    el: h('div', { class: 'view' },
      h('div', { class: 'view-header' }, h('h1', {}, 'Hulp')),
      h('div', { class: 'card prose' },
        q('Hoe zet ik iets op de website?',
          h('p', {}, 'Ga naar Pagina’s of Berichten, klik op "Nieuw toevoegen", vul een titel en tekst in en klik op "Opslaan en online zetten". Uw wijziging wordt veilig opgeslagen in Cloudflare en staat daarna meteen op de website.')),
        q('Wat is een concept?',
          h('p', {}, 'Een concept is opgeslagen, maar staat niet op de website. Zo kun je rustig aan iets werken. Klik op "Opslaan en online zetten" als het klaar is.'),
          h('p', {}, 'Concepten worden veilig binnen Webcraft bewaard. Alleen mensen die toegang hebben tot het beheer kunnen ze zien.')),
        q('Wat is het verschil tussen een pagina en een bericht?',
          h('p', {}, 'Een pagina is vaste informatie, zoals "Over ons" of "Contact", en kan in het menu staan. Een bericht is nieuws met een datum en verschijnt in het berichtenoverzicht.')),
        q('Hoe voeg ik een foto toe?',
          h('p', {}, 'In de tekst: klik in de werkbalk op "Foto". Je kunt een bestaande foto kiezen of een nieuwe uploaden. Alle foto’s vind je ook onder "Foto’s" in het menu.')),
        q('Wat betekent de status bovenin?',
          h('ul', {},
            h('li', {}, h('strong', {}, 'Alles opgeslagen'), ': uw laatste wijziging is veilig bewaard en staat op de website.'),
            h('li', {}, h('strong', {}, 'Bezig met opslaan'), ': Webcraft bewaart uw wijziging. Wacht even tot de status weer groen is.'),
            h('li', {}, h('strong', {}, 'Opslaan mislukt'), ': er ging iets mis. Klik op de status voor meer informatie en probeer opnieuw, of vraag hulp aan degene die de website heeft ingericht.'))),
        q('Kan ik iets terugdraaien?',
          h('p', {}, 'Ja. Onder Overzicht ziet u de recente wijzigingen. Kies "Toon alle versies" en klik bij een eerdere versie op "Terugzetten". De huidige versie blijft dan ook bewaard, zodat u altijd weer terug kunt.')),
        q('Wie kan hier inloggen?',
          h('p', {}, 'Alleen mensen die door de beheerder zijn toegestaan in Cloudflare Access. Zij loggen in met hun e-mailadres en een eenmalige code. Een beheerder kan redacteuren toevoegen in Gebruikers; het e-mailadres moet ook in Cloudflare Access zijn toegestaan.')),
        q('Hoe maak ik een back-up?',
          h('p', {}, 'Ga naar Back-ups in het menu. Daar kunt u een ZIP-bestand downloaden met de bewerkbare inhoud, foto’s, documenten en versiegeschiedenis. Gebruikers, inloggegevens en andere geheime instellingen worden nooit meegenomen.')),
        q('Hoe herstel ik een back-up?',
          h('p', {}, 'Ga naar Back-ups, kies het ZIP-bestand en controleer het overzicht. Pas na uw bevestiging wordt de back-up teruggezet. Webcraft maakt vóór het herstel automatisch een herstelpunt van de huidige gegevens.')),
        q('Wat is Webcraft?',
          h('p', {}, 'Dit beheer heet Webcraft: een eenvoudig systeem om je eigen website bij te houden, zonder WordPress en zonder onderhoud. ',
            h('a', { href: WEBCRAFT_URL, target: '_blank', rel: 'noopener' }, 'Meer over Webcraft'), '.')),
      )),
  };
}
