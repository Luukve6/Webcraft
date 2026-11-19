// Adressen van pagina's op de website.

/** /over-ons/ (standaard) of /over-ons (config "cleanUrls": true, bijv. Cloudflare Pages). */
export function pagePath(config, slug) {
  return config && config.cleanUrls ? `/${slug}` : `/${slug}/`;
}
