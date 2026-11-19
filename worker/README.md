# Inlogdienst "Inloggen met GitHub" (Cloudflare Worker)

Deze map bevat een kleine, eigen inlogdienst. Hij is **optioneel**: zonder deze dienst log je in met een
*fine-grained* toegangssleutel van GitHub (zie de hoofd-README). Met deze dienst krijg je een gewone knop
**"Inloggen met GitHub"**.

## Waarom is hiervoor een externe dienst nodig?

Voor "Inloggen met GitHub" moet GitHub een geheime sleutel (*client secret*) zien. Die mag nooit in de code van de
website of `/admin` staan, want die code kan iedereen lezen. Een Cloudflare Worker bewaart het geheim. Hij is gratis
(100.000 verzoeken per dag; inloggen kost er twee).

De Worker doet maar drie dingen:

1. `/auth` controleert of de vraag van jouw eigen website komt (`ALLOWED_ORIGINS`), maakt een willekeurige
   controlecode (*state*, bescherming tegen CSRF) en stuurt je door naar GitHub.
2. `/callback` ontvangt van GitHub een eenmalige code, controleert de *state*, wisselt de code (met het geheim) om
   voor een toegangssleutel en geeft die met `postMessage` alleen aan jouw eigen beheerpagina.
3. Verder niets: hij bewaart geen sleutels en houdt geen gebruikers bij.

## GitHub App, geen OAuth App

Gebruik een **GitHub App**. Dan:

- werkt de sleutel **alleen voor de repositories waar jij de app op installeert** (bijv. alleen de
  repository van je website), niet voor al je andere repositories;
- heeft de sleutel **alleen de rechten die jij de app geeft** (Contents: lezen en schrijven);
- **verloopt de sleutel na 8 uur**. Daarna log je met één klik opnieuw in.

Een gewone OAuth App (scope `repo`) geeft toegang tot *alle* repositories van wie inlogt. Dat is alleen nog als
reserve ondersteund (`OAUTH_SCOPE = "repo"`).

## Instellen (ongeveer 15 minuten)

Alles hieronder doe je zelf in je eigen accounts. Zet geheimen nooit in de code of in een commit.

### 1. Cloudflare Worker aanmaken

1. Ga in Cloudflare naar **Workers & Pages → Create → Create Worker**. Noem hem `webcraft-login` en klik op **Deploy**.
2. Klik op **Edit code**, vervang alle code door de inhoud van [`oauth-worker.js`](oauth-worker.js) en klik op **Deploy**.
3. Noteer het adres, bijvoorbeeld `https://webcraft-login.jouwnaam.workers.dev`.

### 2. GitHub App aanmaken

1. Ga naar GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**
   (<https://github.com/settings/apps/new>).
2. Vul in:
   - **GitHub App name**: bijv. `Webcraft Mijnsite` (moet uniek zijn op heel GitHub)
   - **Homepage URL**: het adres van je website
   - **Callback URL**: `https://webcraft-login.jouwnaam.workers.dev/callback`
   - **Expire user authorization tokens**: aan laten (sleutel verloopt na 8 uur)
   - **Request user authorization (OAuth) during installation**: uit
   - **Webhook → Active**: **uitvinken** (niet nodig)
3. **Permissions → Repository permissions**:
   - **Contents**: *Read and write*
   - (*Metadata: Read-only* gaat automatisch)
   - de rest: *No access*
4. **Where can this GitHub App be installed?** → **Only on this account**.
5. Klik op **Create GitHub App**. Noteer de **Client ID** (begint met `Iv`).
6. Klik op **Generate a new client secret** en kopieer het geheim (je ziet het maar één keer).
7. Klik links op **Install App** → **Install** → **Only select repositories** → kies de repository van de site.

### 3. Worker instellen

In Cloudflare: open de Worker → **Settings → Variables and Secrets**:

| Naam | Type | Waarde |
|---|---|---|
| `GITHUB_CLIENT_ID` | Text | de Client ID van de GitHub App |
| `GITHUB_CLIENT_SECRET` | **Secret** | het client secret |
| `ALLOWED_ORIGINS` | Text | adres(sen) van je website, bijv. `https://www.example.nl` |

Bij `ALLOWED_ORIGINS` alleen het domein, zonder pad en zonder `/` aan het eind. Meerdere adressen scheid je met een
komma (bijv. ook het `….pages.dev`-adres).

### 4. Beheer koppelen

Zet het adres van de Worker in `admin/config.json` van de site:

```json
"auth": { "oauthUrl": "https://webcraft-login.jouwnaam.workers.dev" }
```

Commit en push. Op `/admin` staat nu de knop **Inloggen met GitHub**. Sleutel plakken blijft mogelijk onder
"Inloggen met een toegangssleutel".

## Andere mensen laten inloggen

Iedereen die mag aanpassen heeft een **eigen GitHub-account** nodig (gratis). Deel nooit je eigen account of sleutel.

1. Ga naar de repository → **Settings → Collaborators → Add people** en nodig het GitHub-account uit (rol *Write*).
2. De ander accepteert de uitnodiging (mail van GitHub) en zet bij voorkeur tweestapsverificatie aan.
3. De ander klikt op `/admin` op **Inloggen met GitHub** en geeft de app eenmalig toestemming.

Iemand weghalen: haal het account weg bij **Collaborators**. Diens sleutel werkt dan direct niet meer voor deze
repository.

## Goed om te weten

- Wie geen schrijfrechten op de repository heeft, kan wel bij GitHub inloggen maar kan in het beheer niets doen;
  GitHub weigert elke wijziging.
- De Worker wordt getest in `tests/worker.test.mjs` (zonder echte GitHub).
