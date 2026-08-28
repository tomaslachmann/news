# Automated Entity → Wikidata Linking Research

Date: 2026-08-28

Research to revisit the deliberately-manual entity→Wikidata linking stance
(`docs/spec-entity-resolution.md` User Story 11, ADR 0022) and work out what a safe *semi*-automated
design would look like: which APIs to call, what matching signals to combine, and a confidence rule
for auto-link vs. route-to-admin-review. Sources are first-party throughout — the MediaWiki Action
API's own machine-generated help, the Wikibase REST API's live OpenAPI document, the W3C
Reconciliation Community Group specification, the OpenRefine-Wikibase service's own source code and
docs, the OpenTapioca paper (read in full from the arXiv PDF), and Wikimedia's own etiquette /
User-Agent / query-service policy pages. Live calls were made against `www.wikidata.org` and the
hosted reconciliation endpoint with the repo's real `User-Agent` to confirm behaviour; those are
marked "verified live". Where a page could not be fetched first-hand it is called out explicitly.

**Headline finding.** The fully-manual stance in ADR 0022 is well-founded for the *hard* cases and
should not be dropped, but it is currently applied uniformly to cases that are not hard at all. A
large fraction of Czech news entities — a `PERSON` whose name has exactly one human bearer with a
`cswiki` article, a `COUNTRY`, a major `ORGANIZATION` — can be linked by a deterministic rule
(exact Czech label/alias match + P31 type coherent with our type + a `cswiki` sitelink + no rival
candidate of the same type) with a false-positive rate low enough to auto-accept, while everything
ambiguous falls through to the *existing* admin review queue pattern. No LLM is needed for the
auto-accept path. The best building block is not a new dependency but two calls this repo already
makes (`wbsearchentities` / `wbgetentities`) plus one CirrusSearch query and, optionally, the
hosted Wikidata reconciliation endpoint as a scoring oracle.

---

## 1. Wikidata MediaWiki Action API

### 1.1 `wbsearchentities` — what the repo calls today

Parameters, from the API's own generated help at
[`action=help&modules=wbsearchentities`](https://www.wikidata.org/w/api.php?action=help&modules=wbsearchentities)
(verified):

| param | meaning | default / range |
|---|---|---|
| `search` | text to search (required) | — |
| `language` | language to search in; "only affects how entities are selected" (required) | — |
| `strictlanguage` | disable language fallback | `false` |
| `type` | entity kind: `item`, `property`, `lexeme`, `form`, `sense`, `entity-schema` | `item` |
| `limit` | results | default `7`, range `0`–`50` (`max`) |
| `continue` | offset to continue from | `0`, range `0`–`10000` |
| `props` | properties per entity — **only value is `url`** | `url` |

Response: an array under `search`, each row `{ id, label, description, match: { type, language, text }, … }`.
`match.type` is `label` / `alias` / etc. The help says it "Returns a label and description for the
entity in the user language if possible. Returns details of the matched term."

Key weaknesses for disambiguation, all confirmed by a live call
(`search=Petr Fiala&language=cs&limit=5`, verified live):

- **No type filter.** `type` only switches item/property/lexeme; it cannot restrict to humans.
  The live call returned four different people plus a *Wikimedia disambiguation page*
  (`Q12044838`) all labelled exactly "Petr Fiala".
- **It is label/alias prefix-and-fuzzy matching ranked by an opaque internal heuristic**, not by
  popularity or sitelink count in any documented way. The `props` parameter cannot return P31,
  sitelinks, or anything else useful for a coherence check — a second call is always needed.
- **Language fallback muddies the signal.** With `language=cs` the live response still returned
  English descriptions ("Czech politician and politologist") because `strictlanguage` defaults to
  `false`; the *label* match was Czech, the description fell back to English.

Conclusion: `wbsearchentities` is a fine *candidate generator* but carries none of the signals
needed to decide a match. That is exactly why `docs/spec-entity-resolution.md` routes its output to
a human.

### 1.2 `wbgetentities` — resolve by sitelink, and batch enrichment

From [`action=help&modules=wbgetentities`](https://www.wikidata.org/w/api.php?action=help&modules=wbgetentities)
(verified) and the [`Wikibase/API`](https://www.mediawiki.org/wiki/Wikibase/API) page:

- `ids` — up to **50** entity ids per request (**500** for clients with `apihighlimits`). Same cap
  applies to `sites`/`titles`.
- `sites` + `titles` — resolve a wiki page title to its Q-id. `sites=cswiki&titles=Praha` →
  `Q1085` (verified live); `titles` accepts a pipe-list against a single `sites` value
  (`sites=cswiki&titles=Praha|Brno` → `Q1085`, `Q14960`, verified live).
- `redirects=no` treats a redirect like a deleted entity; default resolves it.
- `normalize=1` normalises the page title (spaces/underscores, first-letter case) against the
  client wiki before lookup.
- `props` — `labels|descriptions|aliases|claims|sitelinks|datatype|info`; `sitefilter` restricts
  returned sitelinks (the repo already uses `props=descriptions|sitelinks&sitefilter=cswiki` in
  `wikipediaClient.ts`); `languages` restricts label/description languages.

This is the single most valuable call for our use case: **if the entity's canonical name is the
exact title of a `cswiki` article, `wbgetentities&sites=cswiki&titles=…` returns exactly one Q-id
with no disambiguation ambiguity** — Wikipedia titles are unique per language, unlike Wikidata
labels (the OpenTapioca paper makes this exact point — see §7).

### 1.3 CirrusSearch via `action=query&list=search` — type-constrained search

`list=search` parameters, from [`API:Search`](https://www.mediawiki.org/wiki/API:Search)
(verified): `srsearch` (required), `srnamespace` (use `0` for Wikidata items), `srlimit` (1–500,
default 10), `sroffset`, `srqiprofile` (query-independent ranking profile), `srsort`, `srprop`,
`srinfo` (`totalhits|suggestion|rewrittenquery`). The page notes that "on Wikimedia wikis which use
CirrusSearch, see Help:CirrusSearch for … the search syntax".

The Wikidata-specific keywords come from
[`Help:Extension:WikibaseCirrusSearch`](https://www.mediawiki.org/wiki/Help:Extension:WikibaseCirrusSearch)
(verified):

- `haswbstatement:P31=Q5` — items with `instance of` = human. Negation: `-haswbstatement:P31=Q5`.
  Qualifier constraints: `haswbstatement:P180=Q146[P462=Q23445]`; wildcard `[P462=*]`; logical OR
  within one clause: `haswbstatement:P180=Q146|P180=Q144`.
- `inlabel:term@cs` — term in the Czech label/alias; multi-language `inlabel:term@cs,en`; all
  languages `inlabel:term@*`; fallback chain `inlabel:term@cs+`.
- `haslabel:cs` / `hasdescription:cs` — item has a label / description in that language (AND by
  repetition, OR by comma, negation by `-`).
- `wbstatementquantity:` — **currently disabled on all wikis** per the same page.

Verified live: `srsearch=Petr Fiala haswbstatement:P31=Q5` on `www.wikidata.org` returned 21 hits,
all humans, disambiguation page gone (contrast the 5-candidate `wbsearchentities` result in §1.1
which *included* the disambiguation page). `srsearch=inlabel:Fiala@cs haswbstatement:P31=Q5`
returned 467 hits ranked with `Q3377548` (the politician) near the top.

**P31 values that map to our four entity types** (labels verified live via the REST API
`/entities/items/{id}/labels/en`):

| Our type | Primary P31 target | Notes |
|---|---|---|
| `PERSON` | `Q5` (human) | single value, unambiguous |
| `COUNTRY` | `Q6256` (country); also `Q3624078` (sovereign state), `Q7275` (state), historical-country classes | use a small set or a `P31/P279*` subclass test |
| `PLACE` (city/town) | `Q515` (city), `Q3957` (town), `Q532` (village); broader `Q486972` (human settlement), `Q618123` (geographical object) | `Q515` alone is too narrow for regions/districts |
| `ORGANIZATION` | `Q43229` (organization) via `P31/P279*` | subtypes: `Q4830453` company, `Q327333` government agency, `Q7278` political party, `Q1616075` TV station, … — a subclass walk is the only robust test |

OpenTapioca (§7) restricts its index the same way: items whose P31 target is a subclass (`P279*`)
of `Q5`, `Q43229`, or `Q618123` ([paper §5](https://arxiv.org/pdf/1904.09131)).

CirrusSearch `haswbstatement` does **not** do the `P279*` walk itself — `haswbstatement:P31=Q43229`
only matches items whose P31 is *literally* `Q43229`, missing companies/agencies/parties. Either
enumerate the subtype Q-ids in an OR clause, or do the subclass check client-side after fetching
P31 (the reconciliation service resolves this with a cached SPARQL `?child wdt:P279* wd:$qid`
query — see §3.3).

---

## 2. Wikidata REST API

Base URL `https://www.wikidata.org/w/rest.php/wikibase/v1`
([`Wikidata:REST_API`](https://www.wikidata.org/wiki/Wikidata:REST_API), verified). It **is**
covered by Wikidata's Stable Interface Policy and versioned in the path.

The live OpenAPI document
([`/w/rest.php/wikibase/v1/openapi.json`](https://www.wikidata.org/w/rest.php/wikibase/v1/openapi.json),
fetched and parsed — reports `version: "Wikibase REST API 1.5"`) shows these read endpoints
relevant to us:

- `GET /v1/entities/items/{id}` (with field filtering: `type|labels|descriptions|aliases|statements|sitelinks`)
- `GET /v1/entities/items/{id}/labels`, `/descriptions`, `/aliases`, `/sitelinks`, `/statements`
- `GET /v1/entities/items/{id}/labels_with_language_fallback/{lang}` and
  `descriptions_with_language_fallback/{lang}`
- **`GET /v1/search/items?q=&language=&limit=&offset=`** — "Simple Item search by label and aliases"
- **`GET /v1/suggest/items?q=&language=&limit=&offset=`** — "Simple Item search by prefix, for
  labels and aliases" (`limit` max 50, or 500 with `apihighlimits`)

So the REST API **does now have search** (added mid-2024 per a
[wikidata mailing-list thread](https://lists.wikimedia.org/hyperkitty/list/wikidata@lists.wikimedia.org/thread/26Q4RUTPFN2SWZWOEA3TXBH5MCPHLEBU/),
not verified first-hand beyond the OpenAPI doc). It requires CirrusSearch/Elasticsearch on the
backend, which Wikidata has
([`repo_rest-api_README`](https://doc.wikimedia.org/Wikibase/master/php/repo_rest-api_README.html),
partial fetch).

Verified live: `GET /v1/search/items?q=Petr Fiala&language=cs&limit=5` with the repo's honest
`User-Agent`, **no authentication**, returned the expected results with *Czech* descriptions
(`"český politik a politolog"`) and a `match` object per row
(`{ type: "label", language: "cs", text: "Petr Fiala" }`).

**Assessment vs. the Action API for our reads:** the REST API is cleaner (flat JSON, real language
fallback endpoints, honest `match` object) and is the modern, stable-policy-covered surface, but it
has **no type filter** on `/v1/search/items` either, and no `haswbstatement` equivalent — so it
does not remove the need for a second call or a CirrusSearch query. Its rate limits are the same as
the Action API's (it "uses the same underlying classes",
[`Wikidata:REST_API`](https://www.wikidata.org/wiki/Wikidata:REST_API)). Recommendation:
`wbgetentities` stays for the `sites`+`titles` sitelink resolution (no REST equivalent for
"resolve title → id" in one call — the REST way is a separate CirrusSearch-backed path), and
`/v1/search/items?language=cs` is a marginally better candidate generator than `wbsearchentities`
because it returns Czech descriptions without a fallback surprise. Neither is load-bearing enough
to justify migrating the working clients now.

---

## 3. OpenRefine Reconciliation Service API + Wikidata's hosted endpoint

### 3.1 The W3C spec

From the [Reconciliation Service API v0.2 (CG-FINAL, 2023-04-10)](https://www.w3.org/community/reports/reconciliation/CG-FINAL-specs-0.2-20230410/),
cross-checked against the [spec source `0.2/source.html`](https://github.com/reconciliation-api/specs/blob/main/0.2/source.html)
(fetched via the GitHub API and parsed — verified):

**Query batch** — "a set of reconciliation queries indexed by string identifiers". Each query:

- `query` — "a non-empty string … search for entities with similar names. The specifics of how this
  similarity is defined are determined by the service."
- `type` — array of type ids. "Whether this restriction should be a hard constraint or simply
  induce a change on the reconciliation scores can be determined by the service. In particular,
  services MAY return candidates which do not belong to any of the supplied types."
- `limit` — positive integer.
- `properties` — array of `{ pid, v }`. "used to further filter the set of candidates (similar to a
  WHERE clause in SQL) … How reconciliation services handle this further restriction ('must match
  all properties' or 'should match some') and how it affects the score, is up to the service."
- `type_strict` — `"should"` / `"all"` / `"any"`. The spec itself notes: "The meaning of the
  type_strict is unclear, it is inherited from Freebase's API but is not used or documented in
  OpenRefine."

At least one of `query` or `properties` is required; everything else optional.

**Candidate** (results "SHOULD be sorted by decreasing score"):

- `id`, `name`, `description` (optional), `type` (array of `{ id, name }`)
- `score` — "A numeral indicating how well this candidate entity matches the query: a higher score
  indicates a better match" (range is **service-defined** — the spec fixes nothing)
- `features` — optional array of `{ id, value }` where `id` is e.g. `"name_tfidf"` or `"pagerank"`;
  "By exposing individual features in their responses, services make it possible for clients to
  compute matching scores which fit their use cases better."
- `match` — "A boolean matching decision, which indicates whether the service considers this
  candidate good enough to be chosen as a correct match."

The spec does **not** itself state "at most one candidate may have `match: true`" — that rule lives
in the *service* (OpenRefine treats a single `match: true` candidate as an automatic match). The
spec only says an exact-name query "with no other constraint should return at least this entity,
unless it is hidden by many namesakes".

**Transport:** the service MUST accept `POST` with `application/x-www-form-urlencoded` body,
`queries=<url-encoded JSON batch>`; SHOULD also accept `GET ?queries=…`. "The POST method is the
primary way … it does not restrict the length of the query batches." Error handling: "Services
SHOULD use the broad spectrum of HTTP status codes … for … malformed or too frequent queries."
Auth is optional (declared in the service manifest).

### 3.2 Wikidata's hosted endpoint

`https://wikidata.reconci.link/` **307-redirects to**
`https://wikidata-reconciliation.wmcloud.org/` (verified live). The endpoint is
`https://wikidata-reconciliation.wmcloud.org/{lang}/api` — "Replacing 'en' by another language code
will display items and properties in your language, when they are available"
([service front page](https://wikidata-reconciliation.wmcloud.org/), verified). So
`/cs/api` gives Czech labels/descriptions.

It runs the **`openrefine-wikibase`** codebase (a.k.a. "wdreconcile"), Antonin Delpeuch's project,
[`github.com/wetneb/openrefine-wikibase`](https://github.com/wetneb/openrefine-wikibase)
(the repo is **archived** as of this writing — `"archived": true` via the GitHub API — maintenance
has moved, but the hosted WMCloud instance is live and is the one OpenRefine ships as a default).

**Verified live** (`POST`-style `GET ?queries=` to `/cs/api` with the repo's `User-Agent`):

- `{"query":"Petr Fiala","type":"Q5","limit":3}` → three candidates, **all `score: 100`**
  (`Q3377548` politician, `Q12044841` guitarist, `Q12044842` conductor), **all `match: false`**.
- `{"query":"Andrej Babiš","type":"Q5"}` → `Q10819807` (politician) and `Q58869572` (his son),
  both `score: 100`, both `match: false`.
- `{"query":"Sparta","type":"Q5"}` → **empty** (type constraint correctly excludes the football
  club / the ancient city).
- `{"query":"Petr Fiala","type":"Q5","properties":[{"pid":"P39","v":"…"}]}` → scores drop to
  `71.4` with `features: [{id:"P39",value:0},{id:"all_labels",value:100}]` when the supplied
  property does not match — i.e. **properties are scored and pull the composite down/up**; a
  *correct* discriminating property (occupation, position held, date of birth) would separate the
  namesakes.

This is the core lesson: **with only a label + type, an ambiguous Czech name never auto-matches**
(the conservative gap rule below), which is precisely the behaviour ADR 0022 wants. Add one
correct property and the right candidate can clear the bar.

### 3.3 How the score and `match` flag are computed

From the service's own source (`wdreconcile/engine.py`, `config_wikidata.py`) and
[docs `scoring.html`](https://openrefine-wikibase.readthedocs.io/en/latest/scoring.html) (verified):

- **Candidate generation:** for each query it calls **both** `action=query&list=search`
  (`srnamespace=0`) **and** `wbsearchentities` and unions the results (`wikibase_string_search`);
  up to `wd_api_max_search_results = 50`. Properties that are unique-identifier properties are
  resolved directly to Q-ids via SPARQL, bypassing string search.
- **Score:** "a weighted sum of the scores of individual features … ranges from 0 to 100." Name
  matching is "token-based fuzzy matching" between the query and each label/alias (treated as a
  synthetic property `all_labels`). Identifier properties: exact string equality → 100/0.
  Coordinates: linear falloff to 0 at 1 km. Dates: match if within Wikibase precision. "For each
  supplied property, all query values are matched against reference values and the maximum matching
  score of all pairs is used."
- **Type handling:** the candidate's `P31` targets are walked with a cached
  `SELECT ?child WHERE { ?child wdt:P279* wd:$qid }` subclass query; a candidate that has a type
  but not a matching one is **skipped**; a candidate with *no* type is kept but "score divided by
  two"; if *no* candidate matches the target type, the wrong/no-type ones are returned at half
  score (so "there will be no automatic match").
- **`avoid_items_of_class = Q17442446`** ("Wikimedia internal stuff") — filters out disambiguation
  pages, categories, templates by default.
- **Auto-match rule** (`engine.py`, `_rank_items`):

  ```
  validation_threshold                        = 95      # config_wikidata.py
  validation_threshold_discount_per_property   = 5       # per supplied property
  match_score_gap                              = 10

  discounted_threshold = 95 - 5 * (number of supplied properties)
  ranked = candidates sorted by score desc
  ranked[0].match = (ranked[0].score  > discounted_threshold)
               and (ranked[0].score  > ranked[1].score + 10)
  ```

  i.e. **auto-match only if the top candidate scores above ~95 (relaxed by 5 per contextual
  property supplied) AND beats the runner-up by more than 10 points.** This is a concrete, battle-
  tested confidence rule from a service OpenRefine has shipped as its default for years — worth
  adopting more or less directly.

### 3.4 Headless / server-side use, rate limits, terms

- **Can be called headlessly:** yes — it is a plain HTTP JSON API, `GET`/`POST`, no auth. Verified
  live from a shell with the repo `User-Agent`.
- **Rate limits / terms:** none are published on the service front page or in
  [the developer docs](https://openrefine-wikibase.readthedocs.io/en/latest/) (checked — the
  "Error Handling and Rate-limiting" section of the *spec* just says services *may* return 429s;
  the WMCloud instance's own limits are **not documented** — treat as "be gentle, handle 429,
  it is a volunteer-run Toolforge/WMCloud service"). It is self-hostable (Docker / manual /
  production configs in the docs) if volume ever justifies it.
- It depends on `query.wikidata.org/sparql` for its type/subclass lookups, so it inherits WDQS's
  health (§4).

---

## 4. Wikidata Query Service / SPARQL

From the [WDQS User Manual](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual)
(verified):

- Endpoint: `https://query.wikidata.org/sparql`, `GET` or `POST`.
- **Hard query timeout: 60 seconds.**
- **Throttling:** "One client (user agent + IP) is allowed 60 seconds of processing time each 60
  seconds" and "30 error queries per minute"; over the limit → **HTTP 429**. "access to the service
  is limited to **5 parallel queries per IP**."
- **User-Agent:** "Clients who don't comply with the User-Agent policy may be blocked completely."
- Label lookups are slow: the `wikibase:label` service "tries to run last … Blazegraph tries to
  materialise *all* the results of a query before … adding the labels"
  ([query optimization](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/query_optimization),
  verified); prefer `rdfs:label` with a language filter.

**Graph split (important operational context)** — from
[`Wikidata:SPARQL query service/WDQS graph split`](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/WDQS_graph_split)
(verified) and the
[September 2024 scaling update](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/WDQS_backend_update/September_2024_scaling_update):
Blazegraph is near capacity (>16 billion triples, +1 billion/year). On **2025-05-09** the graph was
split into `https://query.wikidata.org/` (**main graph** — humans, countries, cities, organizations
all live here) and `https://query-scholarly.wikidata.org/` (scholarly articles only). Cross-graph
queries need SPARQL federation. A full-graph transitional endpoint
`query-legacy-full.wikidata.org` exists **until December 2025**. For our purposes everything is in
the main graph, so a `?item wdt:P31 wd:Q5; rdfs:label "…"@cs` query is unaffected by the split.

**Is a label+type SPARQL query a viable disambiguation path?** Technically yes:

```sparql
SELECT ?item WHERE {
  ?item rdfs:label "Petr Fiala"@cs ;
        wdt:P31 wd:Q5 .
}
```

returns exact-Czech-label humans. But: (a) it matches **only the label, not aliases** unless you
add `skos:altLabel`; (b) exact-string `rdfs:label` matching is case- and punctuation-sensitive and
misses "Fiala" for "Petr Fiala"; (c) it gives you a set, not a ranked list — no popularity signal
without extra `wikibase:sitelinks` joins; (d) it counts against the 60s/60s processing budget and
the 5-parallel cap. **Verdict:** SPARQL is the right tool for the *offline* one-time question "how
many humans have exactly this Czech label?" (a candidate-count / ambiguity check) and for building
the `P279*` subtype closures once, but not as the per-entity online linker. The Action API's
`haswbstatement` + `inlabel` covers the online case with better ranking and no SPARQL budget.

---

## 5. Rate limits, etiquette, User-Agent policy

- **[API:Etiquette](https://www.mediawiki.org/wiki/API:Etiquette)** (verified): "Making your
  requests in series rather than in parallel … should result in a safe request rate." No hard
  speed limit on *reads*, but usage is monitored; a `ratelimited` error → exponential backoff.
  Batch with pipes (`titles=A|B|C`) and generators. Use `GET` for reads (cacheable). For
  non-interactive tasks, **use `maxlag`** (an integer seconds; the request is deferred when
  replication lag exceeds it — the standard bot value is `maxlag=5`).
- **[User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy)** (verified
  at its new Foundation Governance Wiki home; the old meta page now just points there): required
  format `<client name>/<version> (<contact>) <library>/<version>`, e.g.
  `CoolBot/0.0 (https://example.org/coolbot/; coolbot@example.org) generic-library/0.0`. Contact
  must be an email, URL, or `(<project>; User:<name>)`. Generic agents like `python-requests/x`
  "may face blocking"; "Scripts should use an informative User-Agent string with contact
  information, or they may be blocked without notice." Applies to `api.php` and all automated
  access. **The repo's existing
  `NewsTriangulator/1.0 (+https://github.com/tomaslachmann/news)` (`httpClient.ts`) already
  complies** — keep it; do **not** switch these calls to the browser-shaped header set from
  ADR 0040 (that is only for outlet article bodies, and the same policy explicitly says copying a
  browser UA "is treated as potentially malicious").
- **WDQS**: 60s processing / 60s window, 30 errors/min, 5 parallel queries/IP, 429 on breach
  (§4).
- **Reconciliation endpoint**: no published limits; handle 429, keep batches modest, it is a
  volunteer-run WMCloud service.
- **Anonymous vs. logged-in**: all the reads we need work anonymously (verified live for Action
  API, REST API, reconciliation). Logging in / OAuth only raises `apihighlimits` (50→500 ids per
  `wbgetentities`, 50→500 search `limit`) — not needed at this repo's volume.

Practical shape: **serial requests, one at a time, `maxlag=5` on Action API calls, honest
User-Agent, retry 429/503 with backoff honouring `Retry-After`.** This is the same posture
ADR 0032 already established for the scrape path; reuse it.

---

## 6. Czech-language specifics

- **`language=cs` on `wbsearchentities` / `/v1/search/items`** matches the Czech label and Czech
  aliases. The REST `/v1/search/items?language=cs` returns Czech descriptions directly (verified
  live); `wbsearchentities` falls back to English descriptions unless the item has a Czech one
  (verified live — set `uselang=cs` and be aware fallback still happens; `strictlanguage=1`
  disables *label* fallback but makes recall worse).
- **Czech aliases (`skos:altLabel`)** are the "také známý jako" field. They matter: "USA" is an
  alias of `Q30`, "ČT" / "Česká televize" both point to the broadcaster. `wbsearchentities` and
  `inlabel:…@cs` both search aliases; a plain `rdfs:label` SPARQL match does not.
- **`cswiki` sitelink is the strongest cheap disambiguation signal for Czech news.** Czech
  Wikipedia article titles are unique, and a Czech-news-notable person/org/place almost always has
  a `cswiki` article whose title is (or closely matches) the canonical name. `wbgetentities&
  sites=cswiki&titles=<canonicalName>` returns exactly one Q-id or nothing (verified live:
  `Praha`→`Q1085`, `Brno`→`Q14960`, `Petr Fiala`→`Q3377548` the politician — the guitarist and
  conductor have no `cswiki` article at that bare title). This mirrors `wikipediaClient.ts`'s
  existing `sitefilter=cswiki` usage and ADR 0016's Czech-throughout stance.
- **Presence of a `cswiki` sitelink also correlates with notability / popularity**, which is the
  signal `wbsearchentities` lacks. Number of sitelinks across all wikis (`props=sitelinks`, count
  them) is OpenTapioca's `s_e` popularity feature (§7) and is a cheap tiebreaker.

---

## 7. Prior art for automated Wikidata entity linking

### 7.1 OpenTapioca (Delpeuch, Wikidata Workshop 2020)

Read in full from the [arXiv PDF](https://arxiv.org/pdf/1904.09131). "A simple Named Entity Linking
system that can be trained from Wikidata only … lightweight to train, to run and to keep
synchronous with Wikidata in real time."

**Signals it combines:**

- **Local compatibility** = `p(e) / p(d[s])` — entity popularity over phrase commonness. Popularity
  `p(e)` is "a log-linear combination of its number of statements `n_e`, site links `s_e` and its
  PageRank `r(e)`" where PageRank is "computed on the entire Wikidata using statement values and
  qualifiers as edges". Phrase commonness `p(d[s])` from a unigram model over Wikidata labels.
  Wikidata labels/aliases are "carefully curated … therefore fairly reliable" but "do not come
  with occurrence counts" — so unlike Wikipedia-derived KBs, there is no `P(e|w)` prior.
- **Semantic similarity / mapping coherence** — a one-step-random-walk similarity `s(e,e')` between
  co-occurring candidate entities (shared statement targets), propagated through a Markov chain so
  that "entities mentioned in the same text" reinforce each other.
- **Type restriction** — the index is built from "only items whose type was a subclass of (P279)
  human (Q5), organization (Q43229) or geographical object (Q618123)". Labels/aliases in **all
  languages** go into a case-sensitive FST index.
- **Decision** — a linear SVM over the (local features, and their Markov-propagated versions)
  produces a per-candidate score; "For each spot, our system picks the highest-scoring candidate
  entity that the classifier predicts as a match, if any." The public NIF endpoint has a
  `only_matching` flag — it exposes "only the matches that are deemed good enough" by default
  ([opentapioca README](https://raw.githubusercontent.com/wetneb/opentapioca/master/README.md)).

**Reported F1** (Fig. 2, "InKB micro/macro, GERBIL weak match"):

| dataset | OpenTapioca micro F1 | best baseline |
|---|---|---|
| AIDA-CoNLL | 0.482 | AIDA 0.725 |
| Microposts 2016 | 0.087 (best of table) | — |
| **ISTEX-1000** (author affiliations) | **0.870** (best of table) | DBP Spotlight 0.574 |
| RSS-500 (news) | 0.335 | AIDA 0.455 |

**Stated limitations** (Conclusion): "Our restriction to people, locations and organizations
probably helps … we anticipate worse performance for broader domains. Our approach works best for
scientific affiliations, where spelling is more canonical than in newswire … accuracy degrades on
longer texts which require relying more on the ambient topical context." Also: aliases are
incomplete — "at the time of writing, `Trump` is an alias for Donald Trump (Q22686), but `Cameron`
is not an alias for David Cameron (Q192)". `opentapioca.org` was **unreachable during this
research** (DNS failure — the maintainer notes it needs €50/month hosting and asks for funding);
the code and pre-trained models are on GitHub/HuggingFace.

**Takeaway for us:** OpenTapioca's newswire F1 (~0.34 on RSS-500) is *not* good enough to
auto-accept blindly, and it confirms news text is the hard case. But its *feature set* — label
match + (statements, sitelinks, PageRank) popularity + type restriction to exactly our
person/org/place trio + co-occurrence coherence — is exactly the right list of cheap signals, and
its "pick the top candidate only if the classifier calls it a match" gate is the same shape as the
reconciliation gap rule.

### 7.2 Other tools

- **`spaCy-entity-linker`** ([README](https://raw.githubusercontent.com/egerber/spaCy-entity-linker/master/README.md),
  verified): Wikidata KB, disambiguation is "the only method … is max-prior" (entity popularity,
  **no context sensitivity**), "around 70% accuracy on predicting the correct entities behind link
  descriptions on wikipedia", and the README itself says it "should not be used in production
  mode". Useful only as evidence that pure max-prior tops out around 70% — below an auto-accept
  bar.
- **DBpedia Spotlight** ([api page](https://www.dbpedia-spotlight.org/api),
  [model repo](https://github.com/dbpedia-spotlight/dbpedia-spotlight-model), partial fetches):
  annotates DBpedia resources in text; `confidence` parameter is a **0–1 threshold** (example uses
  `confidence=0.35`) trading precision for recall, plus a `support` parameter (minimum inlink
  count). Targets DBpedia not Wikidata (needs a `owl:sameAs` hop), and OpenTapioca's table has it
  at 0.281–0.574 micro F1. Not a fit — wrong KB, and superseded by the Wikidata-native options.
- **Wikimedia "Add a Link" / link recommendation**
  (the `mwaddlink` structured task): this is recommending **internal wikilinks** between Wikipedia
  articles, *not* linking free-text mentions to Wikidata items — a different task; noted here only
  to disambiguate it, not as prior art for our problem. (Not fetched first-hand.)
- **Wikidata's own `wbsearchentities` autosuggest + the reconciliation service** (§3) are, in
  practice, the tools the Wikidata community itself uses for exactly "which Q-id is this string"
  at scale (OpenRefine reconciliation is the standard bulk workflow).

**Confidence thresholds other tools use:** OpenRefine-Wikibase — composite ≥ 95/100 *and* ≥ 10
ahead of #2 (§3.3). DBpedia Spotlight — tunable 0–1, commonly 0.5. spaCy-entity-linker — none
(always picks max-prior). OpenTapioca — SVM decision boundary, tuned by 5-fold CV on ISTEX+RSS
training sets. The consistent pattern across all of them: **auto-accept requires both an absolute
score floor and a margin over the runner-up.**

---

## 8. Recommended design for this repo

### 8.1 Shape

Keep everything admin-confirmed *by default* (ADR 0022 stands), but add a **narrow deterministic
auto-link fast-path** plus a **suggestion queue** for the rest — the exact "auto-accept the
confident ones, queue the ambiguous ones" pattern this repo already uses for `StoryRelation`
LOW-confidence, `PendingAddition`, and Draft review.

Per unlinked `Entity` (batch job, or triggered when an entity crosses a mention-count threshold):

**Step 1 — cheap candidate gather (2 Action API calls, serial, `maxlag=5`, honest UA):**

1. `wbgetentities&sites=cswiki&titles=<canonicalName>&props=labels|descriptions|claims|sitelinks&languages=cs|en`
   — the **sitelink resolution**. If it returns exactly one item, that item is the *primary
   candidate*.
2. `action=query&list=search&srnamespace=0&srsearch=<canonicalName> haswbstatement:P31=<typeQids>`
   with `<typeQids>` an OR clause of the P31 targets for the entity's type (§1.3). This is the
   **type-constrained candidate list** and the **ambiguity count**.

(Optionally also `wbsearchentities` / `/v1/search/items?language=cs` for alias recall.)

**Step 2 — score the primary candidate.** For the Step-1a item (or the top Step-1b hit if 1a was
empty), fetch/confirm:

| signal | how | auto-link needs |
|---|---|---|
| **exact label/alias match** | Czech label or `skos:altLabel` equals `canonicalName` (case/diacritics-normalised) | yes — exact, not fuzzy |
| **type coherence** | item's `P31` target is (or `P279*`-subclasses to) the Q-id set for our `PERSON`/`COUNTRY`/`PLACE`/`ORGANIZATION` | yes |
| **`cswiki` sitelink present** | `sitelinks.cswiki` exists | yes |
| **not a Wikimedia-internal page** | `P31` is not `Q4167410` (disambiguation), `Q4167836` (category), etc. — reuse the reconciliation service's `avoid_items_of_class = Q17442446` list | yes |
| **no rival of the same type** | Step-1b returned **no other** item that also has an exact Czech label/alias match *and* the coherent type | yes |
| **popularity (tiebreaker only)** | count `sitelinks`; higher is better | not required, used to break near-ties |

**Step 3 — decide:**

- **All six "auto-link needs" satisfied → auto-link.** Write `Entity.wikidataId`, record an
  `AdminActionLog` row with `actorId = "system:auto-wikidata"` (or a dedicated
  `entity.wikidata_autolinked` action so the audit trail distinguishes it), enqueue
  `entity.image.enrich` exactly as `linkEntityWikidata` does today.
- **Otherwise → create a suggestion row** (new `EntityWikidataSuggestion` table, or reuse the
  `EntityAlias` `status` pattern) holding the ranked candidates `{ qid, label, description, score,
  reasons[] }` for an Admin to confirm/reject in the existing entity admin UI. A rejected
  suggestion is recorded as rejected (mirrors `StoryRelation` reject permanence) so the entity is
  not re-suggested identically next pass.

**Step 4 — optional cross-check, not a dependency.** Before auto-linking, optionally POST the
entity (with one discriminating property if we have one — e.g. for a `PERSON` seen alongside a
government `ORGANIZATION`, pass `P106`/`P39`) to the hosted reconciliation endpoint
`/cs/api` and require its top candidate to be the *same* Q-id with `match: true` (its 95-and-gap-10
rule). This buys a second, independently-implemented opinion for free. Handle 429/timeout by
falling back to "queue for admin", never by blocking.

### 8.2 Why this is safe under ADR 0012 / ADR 0022

ADR 0022's objection is that "an unconfirmed automatic match is exactly the kind of unverifiable
assertion ADR 0012 exists to prevent". The fast-path only fires when the match is **not actually
ambiguous**: an exact Czech name match, to an item of the right type, that owns the Czech Wikipedia
article of that name, with no same-type rival. In that situation the "assertion" is about as
verifiable as `Entity.key`'s own deterministic slug — and strictly *more* grounded, because it is
anchored to a `cswiki` article a reader can open. Everything genuinely ambiguous (namesakes,
no `cswiki` article, type mismatch, multiple candidates) still gets a human, exactly as today. The
LLM is avoidable: none of the six auto-link conditions needs one, and adding an LLM disambiguation
step would reintroduce an unverifiable judgement into the one path we want to keep mechanical. Save
LLM disambiguation (if ever) for *ranking within the admin suggestion queue*, where a human is the
backstop.

### 8.3 How this amends the spec

- **`docs/spec-entity-resolution.md` User Story 11** ("neither an alias merge nor a Wikidata link
  is ever inferred and auto-applied without an Admin's confirmation") would be narrowed: a Wikidata
  link **may** be auto-applied when the deterministic six-condition test passes; all other cases
  remain admin-confirmed. Alias merges are untouched.
- **A new ADR** would record: the six-condition auto-link rule and its rationale (this document),
  the `entity.wikidata_autolinked` audit action, the suggestion-queue table, and the explicit
  decision *not* to use an LLM on the auto path.
- **Implementation Decisions** section: add the two-call gather (`wbgetentities` sitelink +
  `haswbstatement` search), the `maxlag=5` / serial / honest-UA posture (already ADR 0032), and
  the optional reconciliation cross-check. `wikidataSearchClient.ts` gains a
  `resolveByCswikiTitle()` and a `searchTypedCandidates()` function alongside the existing
  `searchWikidataEntities()`; the honest User-Agent stays (ADR 0032/0040).

### 8.4 Concrete confidence rule (adopted from OpenRefine-Wikibase, §3.3)

```
score = w_label * labelMatch          # 100 if exact cs label/alias, else token-fuzzy 0..100
      + w_type  * typeCoherent        # 100 if P31/P279* ⊆ our type's Q-ids, 0 otherwise
      + w_site  * hasCswikiSitelink   # 100 / 0
      + w_pop   * min(100, sitelinkCount * k)   # popularity, small weight

auto-link  iff  labelMatch == 100
           and  typeCoherent == 100
           and  hasCswikiSitelink
           and  not isWikimediaInternal
           and  rivalCount == 0        # no other exact-label, coherent-type item
           # optional: reconciliation endpoint agrees with match:true
otherwise  ->  admin suggestion queue, candidates ranked by score
```

The `score` is only for *ordering the queue*; the auto-link gate is the boolean conjunction, which
is stricter and easier to reason about than a threshold. Start with the gate alone; add the
weighted score only for queue ranking.

---

## Gaps and honesty notes

- **`wikidata.reconci.link` / WMCloud reconciliation rate limits and terms of use are not
  published anywhere I could find** — neither the service front page, the spec, nor the
  readthedocs developer docs state a request ceiling or an acceptable-use policy for the hosted
  instance. Treat it as "volunteer-run, be gentle, handle 429, self-host if volume grows". The
  `openrefine-wikibase` GitHub repo is **archived**; the hosted instance is still live and is
  OpenRefine's shipped default, but active development has moved and I did not chase down where.
- **`opentapioca.org` was unreachable** (DNS `ENOTFOUND`) during this research — the live demo and
  its NIF API could not be exercised. All OpenTapioca claims come from the arXiv PDF (read in full)
  and the GitHub README (read), not the running service.
- **DBpedia Spotlight**: only partial page fetches succeeded; the `confidence` parameter range
  (0–1) and the `support` parameter are from example `curl` snippets on the API page, not a
  parameter reference table. Precision/recall figures are taken from OpenTapioca's comparison
  table, not from a DBpedia Spotlight primary evaluation.
- **Wikibase REST API `/v1/search/items` ranking**: the OpenAPI doc describes it as "Simple Item
  search by label and aliases" but does **not** document how results are ranked or whether it
  accepts any filter beyond `q`/`language`/`limit`/`offset`. Live testing confirmed it returns
  sensible order for "Petr Fiala" but I could not verify the ranking algorithm from a primary
  source. The claim that search was "added mid-2024" rests on a mailing-list thread title, not a
  changelog entry read in full.
- **`Help:CirrusSearch` main page and `Help:Wikidata Query Service/CirrusSearch`** both failed or
  404'd; the keyword syntax in §1.3 is from `Help:Extension:WikibaseCirrusSearch` (which fetched
  cleanly) plus live verification against `www.wikidata.org`.
- **User-Agent policy**: the canonical page has moved to the Foundation Governance Wiki; the
  quotes are from that new location. The older `meta.wikimedia.org` page now only redirects.
- **`maxlag=5`** as the conventional bot value is standard practice referenced in API:Etiquette's
  linked `Manual:Maxlag_parameter`, which I did not fetch first-hand this pass — API:Etiquette
  itself only says "use the `maxlag` parameter with an integer representing seconds".
- The **P31 → our-type Q-id mappings** in §1.3 are my synthesis from the OpenTapioca paper's
  `Q5 / Q43229 / Q618123` subclass roots plus live label lookups; there is no single canonical
  Wikidata page that says "these Q-ids mean COUNTRY for a news tool". The exact set to enumerate is
  an implementation-time decision and should be tuned against the real entity corpus.
