export interface RssFeed {
  outlet: string
  domain: string
  url: string
}

export const RSS_FEEDS: RssFeed[] = [
  { outlet: 'iDnes',              domain: 'idnes.cz',               url: 'https://servis.idnes.cz/rss.aspx?c=zpravy' },
  { outlet: 'Novinky',           domain: 'novinky.cz',             url: 'https://www.novinky.cz/rss' },
  { outlet: 'Aktuálně',          domain: 'aktualne.cz',            url: 'https://aktualne.cz/rss' },
  { outlet: 'ČT24',              domain: 'ceskatelevize.cz',       url: 'https://ct24.ceskatelevize.cz/rss/hlavni-zpravy' },
  { outlet: 'Seznam Zprávy',     domain: 'seznamzpravy.cz',        url: 'https://www.seznamzpravy.cz/rss' },
  { outlet: 'iRozhlas',          domain: 'irozhlas.cz',            url: 'https://www.irozhlas.cz/rss/irozhlas' },
  { outlet: 'Hospodářské noviny', domain: 'hn.cz',                 url: 'https://archiv.hn.cz/rss' },
  { outlet: 'Deník',             domain: 'denik.cz',               url: 'https://www.denik.cz/rss' },
]

export const DOMAIN_TO_OUTLET: Record<string, string> = Object.fromEntries(
  RSS_FEEDS.map((f) => [f.domain, f.outlet])
)
