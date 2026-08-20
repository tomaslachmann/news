-- AlterTable
ALTER TABLE "SourceFeed" ADD COLUMN     "parserKind" TEXT NOT NULL DEFAULT 'rss2';

-- Data fixes (ticket 10 / ADR 0032). Two dead SourceFeed URLs found while investigating this
-- ticket: feed-hn's old URL 404s, feed-denik's old URL redirects to an HTML landing page instead
-- of the feed. Three widened to their outlet's all-articles feed ahead of a planned per-category
-- feed configuration. Every replacement URL verified live, fetched and parsed, before this
-- migration was written.
UPDATE "SourceFeed" SET "url" = 'https://archiv.hn.cz/?m=rss' WHERE "id" = 'feed-hn';
UPDATE "SourceFeed" SET "url" = 'https://www.denik.cz/rss/vse.xml' WHERE "id" = 'feed-denik';
UPDATE "SourceFeed" SET "url" = 'https://ct24.ceskatelevize.cz/rss' WHERE "id" = 'feed-ct24';
UPDATE "SourceFeed" SET "url" = 'https://servis.idnes.cz/rss.aspx' WHERE "id" = 'feed-idnes';
UPDATE "SourceFeed" SET "url" = 'https://www.aktualne.cz/rss' WHERE "id" = 'feed-aktualne';

-- New Source/SourceFeed pairs (ticket 10), each verified live as genuine RSS 2.0. CNN Prima NEWS
-- uses the narrower "cnn.iprima.cz" domain, not the bare "iprima.cz" apex, which also serves
-- unrelated non-news iPrima verticals that resolveSource()'s suffix match would otherwise
-- misattribute to this Source.
INSERT INTO "Source" ("id", "name", "domains") VALUES
  ('src-denikn', 'Deník N', ARRAY['denikn.cz']),
  ('src-e15', 'E15', ARRAY['e15.cz']),
  ('src-echo24', 'Echo24', ARRAY['echo24.cz']),
  ('src-ceskenoviny', 'České noviny', ARRAY['ceskenoviny.cz']),
  ('src-cnnprima', 'CNN Prima NEWS', ARRAY['cnn.iprima.cz']);

INSERT INTO "SourceFeed" ("id", "sourceId", "url") VALUES
  ('feed-denikn', 'src-denikn', 'https://denikn.cz/feed/'),
  ('feed-e15', 'src-e15', 'https://www.e15.cz/rss'),
  ('feed-echo24', 'src-echo24', 'https://www.echo24.cz/rss/s'),
  ('feed-ceskenoviny', 'src-ceskenoviny', 'https://www.ceskenoviny.cz/sluzby/rss/zpravy.php'),
  ('feed-cnnprima', 'src-cnnprima', 'https://cnn.iprima.cz/rss');
