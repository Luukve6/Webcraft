// Voorbeeld van het site-specifieke deel. Elke site levert zijn eigen versie van dit bestand
// (een eigen functions/_lib/site.js in de repository van de site). Het beheer en de opslag zijn voor elke site gelijk.
//
// Moet leveren:
//   SITE_DIR                 map met de website in de repository (pdf's/foto's staan onder <SITE_DIR>/assets/...)
//   bouwSite(files)          files: Map(pad -> bytes). Geeft { inhoudJs, meta }:
//                              inhoudJs  -> wordt /assets/data/inhoud.js voor bezoekers
//                              meta      -> klein object dat paginaHtml/waardenVervangen gebruiken
//   paginaHtml(pagina, slug) HTML van een pagina die in het beheer is gemaakt (meta.paginas[slug])
//   waardenVervangen(html, waarden)  vaste teksten in de HTML aanpassen (of gewoon html teruggeven)

export const SITE_DIR = 'public';

export function bouwSite(files) {
  const inhoud = {};
  for (const [p, bytes] of files) {
    if (p.startsWith('content/') && p.endsWith('.json')) inhoud[p.slice(8, -5)] = JSON.parse(new TextDecoder().decode(bytes));
  }
  return { inhoudJs: 'window.SITE = ' + JSON.stringify(inhoud) + ';\n', meta: { paginas: {}, waarden: {} } };
}

export const paginaHtml = () => '';
export const waardenVervangen = (html) => html;
