-- New per-category SourceFeed rows for iRozhlas and iDnes (ticket 79). Unlike ticket 78's 6
-- sources (per-item inline <category> tags), iRozhlas/iDnes carry zero inline signal on their
-- currently-configured all-articles feeds -- these two are categorized via feed-implied
-- categorization instead: each row's own category, resolveCategoryForCandidate
-- (articleCategoryMapping.ts) applies it directly to every item the feed returns, no per-item
-- mapping-table lookup.
--
-- The existing all-articles feeds (feed-irozhlas, feed-idnes) are kept alongside these, not
-- replaced -- dropping them would silently stop ingesting every article outside the rubrics
-- covered below (e.g. iDnes's Auto/Ona Dnes verticals have no dedicated feed here). Both this and
-- the per-category feeds can surface the same article; Ingestion's dedup is keyed on article URL
-- (findAllArticleUrls, and the in-run `known` Set in runIngestionPassLocked), so a duplicate
-- across two feeds for the same outlet is already a no-op, not a new problem.
--
-- Every URL below was fetched live and verified to return a genuine, distinct RSS 2.0 feed for
-- its rubric before this migration was written (same verification bar as
-- 20260820133322_add_feed_parser_kind_and_source_fixes). Not every ArticleCategory value has a
-- feed here: iRozhlas exposes no dedicated crime/health/regional feed, iDnes exposes no dedicated
-- politics feed, and iRozhlas's real regional (14 separate feeds) and fact-check feeds are
-- deliberately out of scope -- 14 extra rows for one already-covered REGIONAL bucket (iDnes's
-- "kraje" feed) is disproportionate, and fact-check has no clean canonical-enum fit. Left `null`
-- rather than guessed, per ticket 78's Answer.
INSERT INTO "SourceFeed" ("id", "sourceId", "url", "category") VALUES
  ('feed-irozhlas-domaci', 'src-irozhlas', 'https://www.irozhlas.cz/rss/irozhlas/section/zpravy-domov', 'DOMESTIC'),
  ('feed-irozhlas-svet', 'src-irozhlas', 'https://www.irozhlas.cz/rss/irozhlas/section/zpravy-svet', 'WORLD'),
  ('feed-irozhlas-ekonomika', 'src-irozhlas', 'https://www.irozhlas.cz/rss/irozhlas/section/ekonomika', 'ECONOMY'),
  ('feed-irozhlas-sport', 'src-irozhlas', 'https://www.irozhlas.cz/rss/irozhlas/section/sport', 'SPORT'),
  ('feed-irozhlas-kultura', 'src-irozhlas', 'https://www.irozhlas.cz/rss/irozhlas/section/kultura', 'CULTURE'),
  ('feed-irozhlas-veda', 'src-irozhlas', 'https://www.irozhlas.cz/rss/irozhlas/section/veda-technologie', 'SCIENCE_TECH'),
  ('feed-irozhlas-komentare', 'src-irozhlas', 'https://www.irozhlas.cz/rss/irozhlas/section/komentare', 'COMMENTARY'),
  ('feed-irozhlas-zivotnistyl', 'src-irozhlas', 'https://www.irozhlas.cz/rss/irozhlas/section/zivotni-styl', 'LIFESTYLE'),
  ('feed-idnes-domaci', 'src-idnes', 'https://servis.idnes.cz/rss.aspx?c=domaci', 'DOMESTIC'),
  ('feed-idnes-zahranicni', 'src-idnes', 'https://servis.idnes.cz/rss.aspx?c=zahranicni', 'WORLD'),
  ('feed-idnes-ekonomika', 'src-idnes', 'https://servis.idnes.cz/rss.aspx?c=ekonomikah', 'ECONOMY'),
  ('feed-idnes-sport', 'src-idnes', 'https://servis.idnes.cz/rss.aspx?c=sport', 'SPORT'),
  ('feed-idnes-kultura', 'src-idnes', 'https://servis.idnes.cz/rss.aspx?c=kultura', 'CULTURE'),
  ('feed-idnes-veda', 'src-idnes', 'https://servis.idnes.cz/rss.aspx?c=veda', 'SCIENCE_TECH'),
  ('feed-idnes-krimi', 'src-idnes', 'https://servis.idnes.cz/rss.aspx?c=krimi', 'CRIME'),
  ('feed-idnes-zdravi', 'src-idnes', 'https://servis.idnes.cz/rss.aspx?c=zdravi', 'HEALTH'),
  ('feed-idnes-kraje', 'src-idnes', 'https://servis.idnes.cz/rss.aspx?c=kraje', 'REGIONAL'),
  ('feed-idnes-nazory', 'src-idnes', 'https://servis.idnes.cz/rss.aspx?c=nazory', 'COMMENTARY'),
  ('feed-idnes-bydleni', 'src-idnes', 'https://servis.idnes.cz/rss.aspx?c=bydleni', 'LIFESTYLE');
