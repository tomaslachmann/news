-- New per-category SourceFeed rows for 7 sources (ticket 85), upgrading them from per-item
-- mapping-table-only categorization (articleCategoryMapping.ts, tickets 78/84) to the more
-- reliable feed-implied mechanism (ticket 79) wherever a genuine, dedicated per-category feed
-- exists. Each source's existing all-articles feed is kept alongside these, not replaced -- same
-- "Ingestion's URL-keyed dedup already collapses a duplicate" reasoning tickets 79/84 already
-- documented. Their existing per-item mapping-table entries also stay: a candidate that only ever
-- arrives via the all-articles feed (feedCategory null) still falls back to it.
--
-- Every URL below was fetched live and verified to return a genuine, distinct RSS 2.0 feed --
-- title, item count and a sample of item links/categories checked, not just a 200 status --
-- before this migration was written. See ticket 85's "Research done before filing this ticket"
-- for the full source-by-source writeup, including which candidate URLs were tried and rejected
-- (redundant sub-feeds, no-clean-fit rubrics, feeds that turned out not to be rubric-filtered at
-- all).
INSERT INTO "SourceFeed" ("id", "sourceId", "url", "category") VALUES
  -- Aktuálně (src-aktualne) -- https://www.aktualne.cz/export-rss/ real index, 100+ feeds
  ('feed-aktualne-domaci', 'src-aktualne', 'https://www.aktualne.cz/rss/domaci/', 'DOMESTIC'),
  ('feed-aktualne-zahranici', 'src-aktualne', 'https://www.aktualne.cz/rss/zahranici/', 'WORLD'),
  ('feed-aktualne-ekonomika', 'src-aktualne', 'https://www.aktualne.cz/rss/ekonomika/', 'ECONOMY'),
  ('feed-aktualne-kultura', 'src-aktualne', 'https://www.aktualne.cz/rss/kultura/', 'CULTURE'),
  ('feed-aktualne-sport', 'src-aktualne', 'https://www.aktualne.cz/rss/sport/', 'SPORT'),
  ('feed-aktualne-nazory', 'src-aktualne', 'https://www.aktualne.cz/rss/nazory/', 'COMMENTARY'),
  ('feed-aktualne-zdravotnictvi', 'src-aktualne', 'https://www.aktualne.cz/rss/zdravotnictvi-22850dba-908b-4192-badc-0e7f1c003a00/', 'HEALTH'),
  ('feed-aktualne-veda', 'src-aktualne', 'https://www.aktualne.cz/rss/veda/', 'SCIENCE_TECH'),
  ('feed-aktualne-regiony', 'src-aktualne', 'https://www.aktualne.cz/rss/regiony/', 'REGIONAL'),

  -- ČT24 (src-ct24) -- ct24.ceskatelevize.cz/rss/rubrika/<slug>-<id>, ids from ČT24's own inline
  -- category domain= attributes (ticket 78)
  ('feed-ct24-domaci', 'src-ct24', 'https://ct24.ceskatelevize.cz/rss/rubrika/domaci-5', 'DOMESTIC'),
  ('feed-ct24-ekonomika', 'src-ct24', 'https://ct24.ceskatelevize.cz/rss/rubrika/ekonomika-17', 'ECONOMY'),
  ('feed-ct24-kultura', 'src-ct24', 'https://ct24.ceskatelevize.cz/rss/rubrika/kultura-24', 'CULTURE'),
  ('feed-ct24-svet', 'src-ct24', 'https://ct24.ceskatelevize.cz/rss/rubrika/svet-16', 'WORLD'),
  ('feed-ct24-veda', 'src-ct24', 'https://ct24.ceskatelevize.cz/rss/rubrika/veda-25', 'SCIENCE_TECH'),

  -- České noviny (src-ceskenoviny) -- www.ceskenoviny.cz/rss/ real index page (distinct from the
  -- feed URLs themselves, sluzby/rss/<slug>.php)
  ('feed-ceskenoviny-cr', 'src-ceskenoviny', 'https://www.ceskenoviny.cz/sluzby/rss/cr.php', 'DOMESTIC'),
  ('feed-ceskenoviny-svet', 'src-ceskenoviny', 'https://www.ceskenoviny.cz/sluzby/rss/svet.php', 'WORLD'),
  ('feed-ceskenoviny-ekonomika', 'src-ceskenoviny', 'https://www.ceskenoviny.cz/sluzby/rss/ekonomika.php', 'ECONOMY'),
  ('feed-ceskenoviny-kultura', 'src-ceskenoviny', 'https://www.ceskenoviny.cz/sluzby/rss/kultura.php', 'CULTURE'),
  ('feed-ceskenoviny-sport', 'src-ceskenoviny', 'https://www.ceskenoviny.cz/sluzby/rss/sport.php', 'SPORT'),

  -- Deník N (src-denikn) -- WordPress's standard /<category-slug>/feed/ convention
  ('feed-denikn-cesko', 'src-denikn', 'https://denikn.cz/cesko/feed/', 'DOMESTIC'),
  ('feed-denikn-svet', 'src-denikn', 'https://denikn.cz/svet/feed/', 'WORLD'),
  ('feed-denikn-ekonomika', 'src-denikn', 'https://denikn.cz/ekonomika/feed/', 'ECONOMY'),
  ('feed-denikn-kultura', 'src-denikn', 'https://denikn.cz/kultura/feed/', 'CULTURE'),
  ('feed-denikn-komentare', 'src-denikn', 'https://denikn.cz/komentare/feed/', 'COMMENTARY'),
  ('feed-denikn-lifestyle', 'src-denikn', 'https://denikn.cz/lifestyle/feed/', 'LIFESTYLE'),
  ('feed-denikn-veda', 'src-denikn', 'https://denikn.cz/veda/feed/', 'SCIENCE_TECH'),

  -- Deník.cz (src-denik) -- www.denik.cz/rss/, 3 of its 7 listed feeds are rubric-scoped
  -- (zpravy.xml and magazin.xml deliberately excluded, their actual items mix categories)
  ('feed-denik-nazory', 'src-denik', 'https://www.denik.cz/rss/nazory.xml', 'COMMENTARY'),
  ('feed-denik-podnikani', 'src-denik', 'https://www.denik.cz/rss/podnikani.xml', 'ECONOMY'),
  ('feed-denik-sport', 'src-denik', 'https://www.denik.cz/rss/sport.xml', 'SPORT'),

  -- Echo24 (src-echo24) -- /rss/s/<slug> scheme found via the site's own <link rel="alternate">
  ('feed-echo24-domov', 'src-echo24', 'https://www.echo24.cz/rss/s/domov', 'DOMESTIC'),
  ('feed-echo24-svet', 'src-echo24', 'https://www.echo24.cz/rss/s/svet', 'WORLD'),
  ('feed-echo24-ekonomika', 'src-echo24', 'https://www.echo24.cz/rss/s/ekonomika', 'ECONOMY'),

  -- CNN Prima NEWS (src-cnnprima) -- /rss/<slug>, slugs from the all-articles feed's own
  -- <category domain="https://cnn.iprima.cz/<slug>"> attributes
  ('feed-cnnprima-domaci', 'src-cnnprima', 'https://cnn.iprima.cz/rss/domaci', 'DOMESTIC'),
  ('feed-cnnprima-zahranici', 'src-cnnprima', 'https://cnn.iprima.cz/rss/zahranici', 'WORLD'),
  ('feed-cnnprima-ekonomika', 'src-cnnprima', 'https://cnn.iprima.cz/rss/ekonomika', 'ECONOMY'),
  ('feed-cnnprima-krimi', 'src-cnnprima', 'https://cnn.iprima.cz/rss/krimi', 'CRIME'),
  ('feed-cnnprima-politika', 'src-cnnprima', 'https://cnn.iprima.cz/rss/politika', 'POLITICS'),
  ('feed-cnnprima-sport', 'src-cnnprima', 'https://cnn.iprima.cz/rss/sport', 'SPORT'),
  ('feed-cnnprima-nazory', 'src-cnnprima', 'https://cnn.iprima.cz/rss/nazory', 'COMMENTARY'),
  ('feed-cnnprima-kultura', 'src-cnnprima', 'https://cnn.iprima.cz/rss/kultura', 'CULTURE'),
  ('feed-cnnprima-regiony', 'src-cnnprima', 'https://cnn.iprima.cz/rss/zpravy-z-regionu', 'REGIONAL');
