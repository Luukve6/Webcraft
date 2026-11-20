# Webcraft – eigen websitebeheer voor statische websites

Een volledig eigen, zelfstandig CMS (content management systeem) in het Nederlands. Je beheert de website via
**`/admin`**, net zo makkelijk als bij WordPress, maar zonder WordPress, Decap, Sanity of andere CMS-dienst.

- **Opslag = GitHub.** Elke keer dat je op "Opslaan" klikt, komt er een echte commit in deze repository.
  Daardoor is alles terug te vinden en terug te zetten.
- **Publiceren = GitHub Actions.** Na elke commit maakt GitHub de website opnieuw en zet hem op GitHub Pages
  (of op een andere gratis host).
- **Geen server, geen database, geen betaalde hosting**, geen externe npm-pakketten.

![Schema](docs/schema.svg)

---

## Inhoud

1. [Wat kan het?](#wat-kan-het)
2. [Snel uitproberen op je eigen computer](#snel-uitproberen-op-je-eigen-computer)
3. [Online zetten (installatie)](#online-zetten-installatie)
4. [Inloggen: twee manieren](#inloggen-twee-manieren)
5. [Inbouwen in een bestaande website](#inbouwen-in-een-bestaande-website)
   - [Eigen soorten inhoud (collecties), bijv. een menukaart](#eigen-soorten-inhoud-collecties)
   - [Voorbeeld: restaurant](#voorbeeld-restaurant)
6. [Configuratie](#configuratie)
7. [Mappen en bestanden](#mappen-en-bestanden)
8. [Veiligheid](#veiligheid)
9. [Testen](#testen)
10. [Beperkingen](#beperkingen)
11. [Uitbreiden en toekomstige verbeteringen](#uitbreiden-en-toekomstige-verbeteringen)

---

## Wat kan het?

| Onderdeel | Wat je kunt doen |
|---|---|
| **Overzicht** | Welkom, tellers (pagina's, berichten, concepten, foto's), snelle knoppen, publicatiestatus, recente wijzigingen |
| **Pagina's** | Lijst met filters (Alles / Online / Concepten) en zoeken; nieuw toevoegen, bewerken, verwijderen; tonen in menu en volgorde |
| **Berichten** | Nieuws/blog met datum, samenvatting en uitgelichte foto |
| **Teksteditor** | Visueel (zoals Word): koppen, vet, schuin, onderstrepen, lijsten, citaat, links (ook naar eigen pagina's), foto's, scheidingslijn, ongedaan maken. Plakken uit Word/websites wordt automatisch opgeschoond. **Voorbeeld bekijken** voordat je opslaat |
| **Concepten** | "Opslaan als concept" (niet op de website) of "Opslaan en online zetten". Een online pagina kun je weer "offline halen" |
| **Foto's** | Uploaden (slepen of kiezen, meerdere tegelijk), grote foto's worden automatisch verkleind, bibliotheek met voorbeelden, adres kopiëren, verwijderen (met waarschuwing als de foto nog gebruikt wordt) |
| **Instellingen** | Naam en omschrijving van de site, homepagina, naam van het berichtenoverzicht, aantal berichten op de homepagina, tekst onderaan |
| **Status** | Bovenin altijd zichtbaar: *Bezig met opslaan… → Opgeslagen · wacht op publicatie → Website wordt bijgewerkt… → Staat online* (of *Online zetten mislukt* met link naar details) |
| **Veilig werken** | Waarschuwing bij niet-opgeslagen wijzigingen (ook bij de terugknop van de browser), bescherming als iemand anders tegelijk hetzelfde wijzigt, "Terug naar …"-knop op elk bewerkscherm, sneltoets Ctrl+S |
| **Hulp** | Uitleg in gewone taal in het beheer zelf |

De interface werkt ook op telefoon en tablet.

---

## Snel uitproberen op je eigen computer

Je hebt alleen [Node.js](https://nodejs.org) (versie 20 of nieuwer) nodig. Er hoeft niets geïnstalleerd te worden
(geen `npm install`).

```powershell
npm run dev
```

Open daarna <http://localhost:8080/admin/> en klik op **Inloggen als testgebruiker**. Dit is een **testmodus** met
een nagebootste GitHub: je kunt alles uitproberen, maar er wordt niets echt opgeslagen.

Andere opdrachten:

| Opdracht | Wat het doet |
|---|---|
| `npm run build` | Maakt de website in de map `_site/` |
| `npm run serve` | Toont `_site/` op <http://localhost:8080> |
| `npm run dev` | Bouwen + tonen in testmodus (nagebootste GitHub) |
| `npm test` | Alle automatische tests |
| `npm run lint` | Syntax-, JSON- en geheimencontrole |
| `npm run check` | Lint + tests + build in één keer |
| `npm run demo` | Maakt `dist/CMS-demo.zip`: demoversie voor elke Windows-pc (zie hieronder) |

### Demo-zip: uitproberen op een andere computer (zonder installatie)

`npm run demo` maakt `dist/CMS-demo.zip`. Op een andere Windows-pc (bijvoorbeeld op je werk):

1. Pak de zip uit en dubbelklik op **Start-demo.cmd**. Dat start een kleine webserver in PowerShell (alleen op
   `localhost`) en opent je browser op het beheer.
2. Klik op **Inloggen als testgebruiker**.

De nagebootste GitHub draait dan helemaal in de browser. Er is geen Node.js, internet of GitHub-account nodig. Je
wijzigingen, ook foto's, blijven in die browser bewaard (IndexedDB). Opnieuw beginnen kan via de knop **Demo opnieuw
beginnen** op het inlogscherm. De voorbeeldwebsite in de zip verandert niet mee: in het echt maakt GitHub Actions of
Cloudflare de site opnieuw. Meer uitleg staat in `LEESMIJ.txt` in de zip.

---

## Online zetten (installatie)

### Stap 1 – Repository en instellingen

1. Zet deze code in een GitHub-repository (dat is deze repository al: `jouw-naam/jouw-website`).
2. Controleer [`admin/config.json`](admin/config.json): `repo.owner`, `repo.name` en `repo.branch` moeten kloppen.

### Stap 2 – GitHub Pages aanzetten

> **Belangrijk: privé-repository + gratis GitHub-account = geen GitHub Pages.**
> GitHub Pages is bij een gratis account alleen beschikbaar voor **openbare** repositories. En een
> GitHub Pages-website is altijd openbaar, ook als de repository privé is (bij een betaald account).
> Deze repository is op dit moment **privé**. Je hebt drie mogelijkheden:
>
> | Keuze | Kosten | Gevolg |
> |---|---|---|
> | **A. Repository openbaar maken** | gratis | Iedereen kan de broncode en de inhoudsbestanden lezen, **ook concepten**. Prima voor een gewone website zonder geheime inhoud. |
> | **B. GitHub Pro** | ± $4 per maand | Pages werkt met een privé-repository; de website zelf is wel openbaar. |
> | **C. Cloudflare Pages (of Netlify) als host** | gratis | Repository blijft privé. Het CMS slaat nog steeds op in GitHub; Cloudflare bouwt en host de site. Zie hieronder. |

**Voor A of B:** ga in GitHub naar **Settings → Pages** en kies bij **Source** voor **GitHub Actions**. Klaar.
Vanaf dan zet de workflow [`.github/workflows/publish.yml`](.github/workflows/publish.yml) de site na elke wijziging
online. Het adres wordt `https://jouw-naam.github.io/jouw-website/` (het "basispad" `/webcraft` wordt automatisch
verwerkt). Zet dat adres daarna in het beheer onder **Instellingen → Adres van de website**.

Staat Pages nog uit, dan doet de workflow wel alle controles en de build, maar slaat hij het publiceren over met een
duidelijke melding. Het beheer toont dan "Opgeslagen · publicatie staat uit".

**Voor C (Cloudflare Pages, privé-repo blijft privé):**

1. Cloudflare-dashboard → **Workers & Pages → Create → Pages → Connect to Git** → kies deze repository.
2. Build command: `npm run build` · Build output directory: `_site` · Omgevingsvariabele `NODE_VERSION` = `22`.
3. Na elke commit (ook vanuit `/admin`) bouwt Cloudflare de site opnieuw. GitHub Actions blijft de controles en tests draaien.
4. Zet in `admin/config.json` `"hosting": "cloudflare"`. Het beheer meldt na opslaan dan
   "Opgeslagen · Cloudflare zet het online" en geeft geen waarschuwing meer dat GitHub Pages uit staat. Als de
   controles in GitHub Actions falen, toont het beheer "Online zetten mislukt".
5. Koppel je eigen domein in Cloudflare (Pages-project → Custom domains). Daarna is het beheer bereikbaar op
   `https://jouwdomein/admin`. Je kunt `/admin` extra afschermen met Cloudflare Access (gratis): dan krijgen alleen
   toegestane e-mailadressen het inlogscherm te zien.

### Stap 3 – Inloggen instellen

Zie hieronder. De eenvoudigste start is de **toegangssleutel**; die werkt meteen zonder extra dienst.

---

## Inloggen: twee manieren

GitHub Pages heeft geen server, dus er kan geen wachtwoord op de server gecontroleerd worden. Daarom logt iedereen
in met **zijn eigen GitHub-account**. GitHub bepaalt wie iets mag wijzigen: alleen mensen met schrijfrechten op de
repository. Iedereen kan de inlogpagina `/admin` zien, maar zonder geldige GitHub-toegang kan niemand iets lezen of
wijzigen (bij een privé-repository) of wijzigen (bij een openbare repository).

### Manier 1 – Toegangssleutel (gratis, alleen GitHub, geen extra dienst)

1. Ga naar <https://github.com/settings/personal-access-tokens/new> (*Fine-grained token*).
2. **Repository access**: *Only select repositories* → kies `jouw-naam/jouw-website`.
3. **Permissions → Repository permissions**:
   - **Contents**: *Read and write* (nodig om op te slaan)
   - **Actions**: *Read-only* (om de publicatiestatus te tonen)
   - **Pages**: *Read-only* (om te zien of Pages aanstaat)
   - (*Metadata: Read-only* gaat automatisch)
4. Kies een vervaldatum, klik op **Generate token** en plak de sleutel op `/admin`.

Voordeel: de sleutel werkt alleen voor deze ene repository. Nadeel: je moet hem na de vervaldatum vernieuwen.

### Manier 2 – "Inloggen met GitHub" (GitHub App, via een gratis Cloudflare Worker)

Een gewone inlogknop. Hiervoor is een kleine externe dienst nodig die het geheime *client secret* bewaart, want dat
mag nooit in de code van de website staan. Volledige uitleg: [`worker/README.md`](worker/README.md).
Daarna vul je in [`admin/config.json`](admin/config.json) bij `auth.oauthUrl` het adres van je Worker in.

| | Toegangssleutel | Inloggen met GitHub |
|---|---|---|
| Extra dienst nodig | Nee | Ja, Cloudflare Worker (gratis) |
| Gebruiksgemak | Eenmalig sleutel maken en plakken | Eén klik |
| Toegang van de sleutel | Alleen deze repository | Alleen de repositories waar de GitHub App op staat; verloopt na 8 uur |
| Waar staat de sleutel | Alleen in jouw browser | Alleen in jouw browser |

"Ingelogd blijven op deze computer" bewaart de sleutel in de browser (`localStorage`); zonder vinkje is hij weg
zodra je de browser sluit (`sessionStorage`).

---

## Inbouwen in een bestaande website

Er zijn twee manieren:

**A. Je bestaande site laten meebouwen (aanbevolen).** Zet de bestanden van je bestaande statische website in de map
[`static/`](static). Alles daarin wordt 1-op-1 naar de website gekopieerd. Het CMS voegt pagina's
(`/adres/`), berichten (`/blog/adres/`), foto's (`/media/...`) en het beheer (`/admin/`) toe. Pas de opmaak van
CMS-pagina's aan in [`templates/`](templates) (gewone HTML met `{{...}}`-plekken) en
[`static/assets/site.css`](static/assets/site.css).

**B. Alleen het beheer toevoegen aan een site met een eigen bouwproces.** Kopieer de mappen `admin/` en
`content/` naar je project, pas `admin/config.json` aan, en laat je eigen site de JSON-bestanden in
`content/pages/` en `content/posts/` lezen. Zorg dat de map `admin/` op `/admin/` gepubliceerd wordt. Gebruik
`admin/js/lib/sanitize.js` om de HTML uit `body` veilig te tonen.

---

### Eigen soorten inhoud (collecties)

Naast pagina's en berichten kan het beheer **formulieren** tonen voor gestructureerde inhoud, zoals een menukaart,
openingstijden of prijzen. Je beschrijft de velden in `admin/config.json` onder `collections`. Het beheer maakt er
dan zelf de lijst, het zoekveld, de formulieren, de controles en de commits bij. Er is geen eigen code nodig.

Twee soorten:

| Soort | Sleutel | Voorbeeld |
|---|---|---|
| Map met één JSON-bestand per item | `"folder": "content/gerechten"` | Gerechten van de menukaart |
| Eén vast JSON-bestand | `"file": "content/openingstijden.json"` | Openingstijden, maandmenu |

Veldtypen (`widget`):
- `string` (standaard), `text`, `number` (met `euro`, `integer` en `min`), `boolean`, `date`
- `select` (met `options` en `multiple`)
- `relation` (keuzelijst uit een ander bestand: `file`, `list`, `valueField`, `labelField`)
- `object` (velden in een groep)
- `list`: een lijst met losse regels (`field`) of met blokken (`fields`), met `allowAdd`, `summary` en `summaryWhen`
- `hidden`: blijft bewaard, maar wordt niet getoond
- `file`: bestand uploaden, bijv. een PDF (`accept`, `folder` = map in de repository, `publicFolder` = adres op de website, `fileName` = vaste naam zodat steeds hetzelfde bestand wordt vervangen, `maxSizeMB`). Het bestand gaat in dezelfde commit mee als de JSON

Andere instellingen per veld:
- Velden zijn standaard verplicht. Met `"required": false` krijgt een veld "(optioneel)".
- `hint` geeft een uitleg onder het veld.
- `pattern` controleert de invoer en geeft een eigen melding, bijvoorbeeld `["^\\d\\d:\\d\\d$", "Schrijf de tijd als 15:30."]`.
- `requiredUnless: "closed"`: verplicht, behalve als het vinkje `closed` op hetzelfde niveau aan staat.
- `requiredWith: "from"`: verplicht zodra het veld `from` is ingevuld (voor datums die bij elkaar horen).
- `notBefore: "from"` (gelijk mag) en `after: "open"` (moet later): volgorde van datums of tijden ten opzichte
  van een ander veld. Eigen tekst met `orderMessage`, bij verplicht met `requiredMessage`.
- Bij een lijst: `unique: true` (losse waarden) of `unique: "id"` (veld in een blok) weigert dubbele waarden.
- Bij een lijst met blokken: `referencedBy: { "collection": "gerechten", "field": "categorie", "key": "id" }`
  weigert opslaan als je een blok weghaalt (of de code verandert) waar andere items nog naar verwijzen.
- Bij een veld in een blok: `slugFrom: "titel"` vult de code vanzelf uit de titel bij een nieuw blok, en
  `lockExisting: true` maakt de code van bestaande blokken alleen-lezen.
- Bij een `object` met twee datums: `dateWindow: { "from": "from", "to": "to", "showDaysBefore": 21, "noun": "vakantiemelding" }`
  toont onder de datums in gewone taal of de melding nu op de website staat, wanneer hij verschijnt, of dat de periode voorbij is.

Instellingen per collectie (map):
- `slug` bepaalt de bestandsnaam van een nieuw item, bijvoorbeeld `"{nummer}-{naam}"`.
- `titleField` is het veld met de naam van een item, en `columns` zijn de kolommen in de lijst.
- `sortBy` bepaalt de volgorde en `groupBy` groepeert de lijst, bijvoorbeeld per rubriek.
- `orderField` (bijv. `"volgorde"`): de volgorde verander je door rijen in de lijst te slepen (per groep). Maak het veld
  zelf `"widget": "hidden"`; een nieuw item komt vanzelf achteraan in zijn groep.
- Lijsten in een formulier (bijv. categorieën of gerechten van een menu) hebben links een sleepgreep. Pagina's
  zet je in de lijst Pagina's in de goede volgorde voor het menu.
- `previewUrl` voegt de knop "Bekijk op de website" toe.

Met `"features": { "pages": false, "posts": false, "media": false, "settings": false }` verberg je de vaste
onderdelen. Dan bevat het beheer alleen je eigen collecties.

Bij het opslaan blijven velden die niet in het formulier staan gewoon in het bestand staan. Lege, niet-verplichte
velden die er eerst niet waren, worden niet toegevoegd. Zo blijven de JSON-bestanden schoon en zie je in de
GitHub-geschiedenis alleen de echte wijziging.

### Vaste pagina's

Een pagina met `"fixed": true` in `content/pages/<adres>.json` bestaat al op de website met een eigen ontwerp.
In het beheer kun je dan alleen de naam in het menu, de plaats in het menu, wel/niet in het menu en extra tekst
aanpassen. Het adres ligt vast, en verwijderen of offline halen kan niet. Wat de website met de extra tekst
doet, bepaalt de website zelf (bijvoorbeeld onderaan de pagina).

### Voorbeeld: restaurant

In `sites/voorbeeld/config.json` staat een volledig uitgewerkt beheer voor een (verzonnen) restaurant: menukaart
met categorieën, afhaallijst als PDF, maandmenu, openingstijden, vakantie en mededeling, weekendbuffet en catering.
Gebruik het als startpunt: kopieer het naar `admin/config.json` van je eigen site en pas de velden en
bestandsnamen aan. De website zelf (het ontwerp en het bouwscript dat de JSON-bestanden omzet naar de pagina's)
maak je per site; het beheer schrijft alleen de JSON-bestanden in `content/`.


## Configuratie

### `admin/config.json` (beheer)

```json
{
  "repo": { "owner": "jouw-naam", "name": "jouw-website", "branch": "main" },
  "auth": { "oauthUrl": "" },
  "apiBase": "https://api.github.com",
  "siteUrl": "",
  "maxImageWidth": 2000
}
```

| Sleutel | Betekenis |
|---|---|
| `repo.owner`, `repo.name`, `repo.branch` | Waar de inhoud wordt opgeslagen |
| `auth.oauthUrl` | Adres van je OAuth-Worker. Leeg = alleen inloggen met toegangssleutel |
| `logo` | Logo van de site in het vierkantje linksboven in het beheer, bijv. `"../assets/img/logo.svg"` (adres gezien vanaf `/admin/`). Leeg = de eerste letter van `siteName` |
| `apiBase` | GitHub API (alleen wijzigen voor GitHub Enterprise; pas dan ook `connect-src` in `admin/index.html` aan) |
| `siteUrl` | Adres van de website voor "Website bekijken" (kan ook via Instellingen in het beheer) |
| `maxImageWidth` | Bredere foto's worden bij uploaden verkleind tot deze breedte (in pixels) |
| `hosting` | `"github-pages"` (standaard) of `"cloudflare"`. Bepaalt welke publicatiestatus het beheer toont |
| `cleanUrls` | `true`: pagina-adressen zonder slash aan het eind (`/over-ons` in plaats van `/over-ons/`), zoals Cloudflare Pages |
| `media` | Waar foto's komen, bijv. `{ "dir": "public/assets/img/fotos", "url": "/assets/img/fotos" }`. Standaard `media/` |
| `pagePreviewCss` | Stylesheet voor "Voorbeeld bekijken" bij pagina's, bijv. `/assets/css/style.css` |
| `local` | Optioneel, bijv. `{ "api": "/__beheer" }`. Alleen op `localhost`: het beheer slaat niet in GitHub op maar via de lokale webserver van de website op schijf (`GET <api>/bestanden`, `POST <api>/opslaan`). Online heeft dit geen effect. Zie `admin/js/local.js` |

Dit bestand bevat **geen geheimen** en mag openbaar zijn.

### `content/site.json` (website, aan te passen via Instellingen)

`title`, `description`, `url`, `homepage` (adres van de homepagina, leeg = berichtenoverzicht),
`showBlogInMenu`, `blogTitle`, `postsOnHome`, `footer`.

### Build (`scripts/build.mjs`)

| Omgevingsvariabele | Betekenis |
|---|---|
| `BASE_PATH` | Bijv. `/webcraft` als de site in een submap staat (wordt in Actions automatisch ingevuld) |
| `SITE_URL` | Volledig adres, voor `sitemap.xml` |

---

## Mappen en bestanden

```
admin/                  Het beheer (/admin) – gewone HTML/CSS/JavaScript, geen build nodig
  index.html            Startpagina met strikte Content-Security-Policy
  config.json           Instellingen van het beheer (geen geheimen)
  css/admin.css         Opmaak
  js/app.js             Opstarten, menu, navigatie
  js/auth.js            Inloggen/uitloggen (sleutel alleen in de browser)
  js/store.js           Inhoud in het geheugen + opslaan/verwijderen/uploaden
  js/publish.js         Volgt de publicatie in GitHub Actions
  js/editor.js          Visuele teksteditor
  js/ui.js              Knoppen, meldingen, dialogen
  js/views/*.js         Schermen: overzicht, lijst, bewerken, foto's, instellingen, hulp, inloggen
  js/lib/github.js      Koppeling met de GitHub API (commits via de Git Data API)
  js/lib/content.js     Regels voor inhoud (adressen, controles) – gedeeld met de build
  js/lib/sanitize.js    HTML-opschoner – gedeeld met de build
content/
  site.json             Algemene instellingen
  pages/<adres>.json    Pagina's
  posts/<adres>.json    Berichten
media/                  Foto's
static/                 Vaste bestanden van de website (CSS, je eigen bestaande site)
templates/              HTML-sjablonen van de website
scripts/
  build.mjs             Maakt de website in _site/
  serve.mjs             Lokale server (met --mock: nagebootste GitHub)
  mock-github.mjs       Nagebootste GitHub API voor tests
  lint.mjs              Controles + geheimen-scan
  github-selftest.mjs   Test tegen de echte GitHub API (draait in Actions)
tests/                  Automatische tests (node --test)
worker/                 Optionele inlogdienst (Cloudflare Worker)
.github/workflows/
  publish.yml           Controleren, bouwen, publiceren bij elke wijziging op main
  zelftest.yml          Echte GitHub-test op de branch cms-zelftest
docs/                   Schema en eindrapport
```

### Voorbeeld van een inhoudsbestand

`content/pages/over-ons.json`:

```json
{
  "title": "Over ons",
  "slug": "over-ons",
  "status": "published",
  "body": "<p>Hier vertel je wie je bent.</p>",
  "description": "Wie wij zijn.",
  "created": "2026-11-19T09:00:00.000Z",
  "updated": "2026-11-19T09:00:00.000Z",
  "inMenu": true,
  "menuOrder": 1
}
```

Berichten hebben in plaats van `inMenu`/`menuOrder` de velden `date`, `excerpt` en `image`.

---

## Veiligheid

- **Geen geheimen in de code.** Er staat nergens een token, wachtwoord of client secret in de repository.
  `npm run lint` (ook in GitHub Actions) zoekt actief naar GitHub-tokens en privésleutels en laat de build mislukken
  als er een gevonden wordt.
- **De toegangssleutel blijft in de browser** van de gebruiker en gaat alleen naar `api.github.com`. Dat wordt
  afgedwongen met een Content-Security-Policy in `admin/index.html` (`connect-src 'self' https://api.github.com`,
  geen scripts van andere websites).
- **Rechten regelt GitHub.** Alleen wie schrijfrechten heeft op de repository kan iets opslaan. Het beheer
  controleert dat bij het inloggen en GitHub weigert elke andere poging.
- **HTML wordt opgeschoond** bij plakken, bij opslaan én bij het bouwen van de site (alleen toegestane tags en
  attributen, geen `<script>`, geen `onclick`, geen `javascript:`-links). SVG-uploads zijn niet toegestaan omdat
  daar scripts in kunnen zitten.
- **OAuth-Worker**: geheim alleen als Cloudflare-secret, controle op toegestane websites, *state*-controle tegen
  CSRF, token alleen via `postMessage` naar de eigen website, `Cache-Control: no-store`.
- **Gelijktijdig werken**: bij opslaan controleert het beheer of het bestand intussen door iemand anders is
  gewijzigd. Zo ja, dan wordt er niets overschreven en krijg je een duidelijke melding.
- `/admin` heeft `noindex` zodat zoekmachines de inlogpagina niet tonen.
- **Beveiligingsheaders per site.** Zet in de map die Cloudflare online zet een `_headers`-bestand met een
  Content-Security-Policy voor de hele site en een strengere voor `/admin/*` (`frame-ancestors 'none'`,
  `connect-src 'self' https://api.github.com`). Zie `site/_headers` (de productpagina) als voorbeeld.

---

## Testen

```powershell
npm run check
```

| Testbestand | Wat wordt getest |
|---|---|
| `tests/sanitize.test.mjs` | Opschonen van HTML, blokkeren van gevaarlijke links en scripts (XSS) |
| `tests/content.test.mjs` | Adressen, controles en foutmeldingen |
| `tests/github.test.mjs` | GitHub-koppeling: lezen, commits met meerdere bestanden, binaire foto's, verwijderen, conflicten, race-condities, rechten |
| `tests/build.test.mjs` | Website maken: pagina's, berichten, menu, concepten niet publiceren, basispad, sitemap, foutmeldingen |
| `tests/flow.test.mjs` | De hele keten: beheer → commits → website |
| `tests/worker.test.mjs` | Inlogdienst: doorsturen, state-controle, geen geheimen in URL of pagina |

Daarnaast test de workflow **CMS-zelftest** het beheer tegen de **echte** GitHub API: push naar de branch
`cms-zelftest` en de workflow maakt daar echte commits (pagina aanmaken, online zetten, foto uploaden, hernoemen,
verwijderen) en zet het resultaat in `zelftest/resultaat.json` op die branch.

---

## Beperkingen

- **GitHub Pages bij een privé-repository** vraagt een betaald GitHub-account (zie stap 2). Alternatief: Cloudflare Pages.
- **Concepten zijn zichtbaar in de repository.** Ze staan niet op de website, maar wie de repository kan lezen,
  kan ze zien. Bij een openbare repository is dat iedereen.
- **Publiceren duurt ongeveer 1 minuut** na opslaan (zo lang doet GitHub Actions erover).
- **Grootte**: bedoeld voor kleine tot middelgrote websites (tot enkele honderden pagina's en een paar honderd MB
  aan foto's). Foto's tot 15 MB per stuk na verkleinen.
- **Eén taal**, geen meertalige inhoud.
- **Geen gebruikersbeheer in het CMS zelf**: gebruikers voeg je toe als *collaborator* op GitHub.
- **Geen geplande publicatie** (op een datum in de toekomst automatisch online).
- De editor gebruikt de ingebouwde bewerkfunctie van de browser (`contenteditable`). Die werkt in alle moderne
  browsers, maar kan per browser net iets anders reageren.

---

## Uitbreiden en toekomstige verbeteringen

De code is opgezet om uit te breiden:

- **Nieuw inhoudstype** (bijv. "Evenementen"): voeg een type toe in `TYPES` in `admin/js/lib/content.js`, extra
  velden in `normalizeItem`, een menu-item in `admin/js/app.js` en een sjabloon + bouwstap in `scripts/build.mjs`.
- **Ander ontwerp**: pas `templates/*.html` en `static/assets/site.css` aan; de inhoud verandert niet.

Ideeën voor later:

1. **Echte bouwstatus van Cloudflare Pages** (nu: controles via Actions, daarna "Cloudflare zet het online").
2. **Versiegeschiedenis per pagina** in het beheer, met "deze versie terugzetten" (de data staat al in Git).
3. **Concepten op een aparte branch**, zodat ze ook in een openbare repository niet zichtbaar zijn.
4. **Geplande publicatie** via een geplande GitHub Actions-workflow.
5. **Meer blokken** in de editor: tabellen, knoppen, video's, kolommen.
6. **Foto's in meerdere formaten** (WebP/AVIF, responsive `srcset`).
8. **Zoekfunctie** op de website (index bij de build).
9. **Meertaligheid** en **menu-editor** met submenu's.

---

## Rechten

© 2026 Webcraft. Alle rechten voorbehouden. Je mag de code bekijken en lezen; gebruiken, kopiëren of aanpassen
mag alleen met toestemming.
