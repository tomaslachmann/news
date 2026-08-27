-- New per-category SourceFeed rows for Hospodářské noviny and E15 (ticket 84) -- same
-- feed-implied-categorization mechanism ticket 79 established for iRozhlas/iDnes. Each source's
-- existing all-articles feed (feed-hn, feed-e15) is kept alongside these, not replaced -- same
-- "Ingestion's URL-keyed dedup already collapses a duplicate" reasoning ticket 79 already
-- documented.
--
-- Every URL below was fetched live and verified to return a genuine, distinct RSS 2.0 feed for
-- its rubric before this migration was written (rss.hn.cz's own real RSS index page for HN;
-- e15.cz's per-section atom:link rel="self" for E15's numeric-id scheme). HN's auto.hn.cz and any
-- E15 sport feed (no working id found this pass) are deliberately left out -- no clean
-- ArticleCategory fit for the former, no confirmed URL for the latter.
INSERT INTO "SourceFeed" ("id", "sourceId", "url", "category") VALUES
  ('feed-hn-domaci', 'src-hn', 'https://domaci.hn.cz/?m=rss', 'DOMESTIC'),
  ('feed-hn-zahranicni', 'src-hn', 'https://zahranicni.hn.cz/?m=rss', 'WORLD'),
  ('feed-hn-byznys', 'src-hn', 'https://byznys.hn.cz/?m=rss', 'ECONOMY'),
  ('feed-hn-nazory', 'src-hn', 'https://nazory.hn.cz/?m=rss', 'COMMENTARY'),
  ('feed-hn-tech', 'src-hn', 'https://tech.hn.cz/?m=rss', 'SCIENCE_TECH'),
  ('feed-hn-art', 'src-hn', 'https://art.hn.cz/?m=rss', 'CULTURE'),
  ('feed-hn-vikend', 'src-hn', 'https://vikend.hn.cz/?m=rss', 'LIFESTYLE'),
  ('feed-e15-domaci', 'src-e15', 'https://www.e15.cz/rss/6081', 'DOMESTIC'),
  ('feed-e15-zahranicni', 'src-e15', 'https://www.e15.cz/rss/6085', 'WORLD'),
  ('feed-e15-ekonomika', 'src-e15', 'https://www.e15.cz/rss/9474', 'ECONOMY'),
  ('feed-e15-byznys', 'src-e15', 'https://www.e15.cz/rss/6089', 'ECONOMY'),
  ('feed-e15-kultura', 'src-e15', 'https://www.e15.cz/rss/9768', 'CULTURE');
