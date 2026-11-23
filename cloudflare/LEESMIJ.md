# Webcraft zonder GitHub: alles in Cloudflare

Met deze opslag heeft een site geen GitHub nodig:

- **Inloggen** op `<site>/admin` gaat via **Cloudflare Access**: e-mailadres invullen, code uit de mail overtypen.
- **Opslaan** gaat direct naar **Cloudflare KV**. De website haalt de inhoud daar live uit, dus het staat meteen online.
- **Versies**: de laatste 10 versies staan op het Overzicht en zijn met één klik terug te zetten.
- **Gebruikers**: een admin voegt in het beheer collega's toe als *admin* of *redacteur*. De allereerste persoon die inlogt, wordt automatisch admin.

## Bestanden

```
functions/
  _middleware.js          website: inhoud.js, pdf's/foto's en pagina's live uit KV
  _lib/access.js          controleert het ondertekende token van Cloudflare Access
  _lib/opslag.js          opslaan, geschiedenis, terugzetten, gebruikers (KV)
  _lib/site.js            PER SITE: hoe de inhoud van deze site wordt gebouwd (voorbeeld in deze map)
  admin/api/[[route]].js  API van het beheer (/admin/api/...)
<website>/_routes.json    welke adressen langs de Functions gaan (vaste bestanden niet)
wrangler.toml             naam, KV-koppeling en Access-instellingen
```

Kopieer `cloudflare/functions/` naar de hoofdmap van de repository van de site en schrijf daar een eigen
`functions/_lib/site.js`. Zet in `admin/config.json` van de site: `"storage": { "api": "/admin/api" }`
(en haal `repo`, `auth` en `local` weg).

## Eenmalig instellen

1. `npx wrangler login`
2. `npx wrangler kv namespace create WEBCRAFT_DATA`. Zet het id in `wrangler.toml`.
3. `npx wrangler pages project create <naam> --production-branch main`
4. `npx wrangler pages deploy`
5. Zero Trust > Access > Applications > *Add an application* > Self-hosted:
   - domein `<naam>.pages.dev`, pad `admin`;
   - inlogmethode *One-time PIN*;
   - policy: *Allow*, de e-mailadressen van de beheerders.

   Neem de *Application Audience (AUD) Tag* en je teamdomein (`<team>.cloudflareaccess.com`) over in `wrangler.toml`. Daarna opnieuw `npx wrangler pages deploy`.
6. Inhoud overzetten. Maak eerst een JSON met `{ versie: 1, tijd, email, wat, bestanden: { pad: base64 } }`
   (bijv. met een klein script in de repository van de site), dan:
   `npx wrangler kv key put files --path <bestand>.json --binding WEBCRAFT_DATA --remote`
7. Open `<naam>.pages.dev/admin` en log in. Jij bent nu admin.

## Lokaal testen

```
npx wrangler kv key put files --path <bestand>.json --binding WEBCRAFT_DATA --local
npx wrangler pages dev --binding DEV_EMAIL=jij@voorbeeld.nl
```

`DEV_EMAIL` werkt alleen op localhost; online telt alleen het token van Access.

## Gratis grenzen

- **Workers/Functions:** 100.000 verzoeken per dag. Vaste bestanden tellen niet mee (`_routes.json`).
- **KV:** 100.000 keer lezen en 1.000 keer schrijven per dag. Eén opslag kost ongeveer 5 schrijfacties.
- **Access:** gratis tot 50 gebruikers.

## Wat anders is dan met GitHub

- **Geschiedenis:** maar 10 versies (alleen tekst; foto's en pdf's niet), in plaats van alles in git.
- **Code bijwerken** (ontwerp of nieuwe Webcraft-versie): met `npx wrangler pages deploy`, niet via een commit.
- **Snelheid:** KV is wereldwijd binnen ongeveer een minuut bijgewerkt. Dichtbij (zelfde land) meestal meteen. Bezoekers krijgen de inhoud maximaal 30 seconden uit de cache.
