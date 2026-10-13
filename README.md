# techdata

A public data workbench: one console over several data collections,
each read through its own adapter, with search, filters, comparison and
exports that carry their source and collection date. It is the first product
built on the SaaS Maker UI library (`sass-maker/ui-library`, Console template).

Plan and decisions: [Significant-Hobbies/ph-catalog#14](https://github.com/Significant-Hobbies/ph-catalog/issues/14).
Collectors stay in their own repos; techdata only reads until parity is proven.

## Collections

| Collection | Source | Read via | Freshness |
| --- | --- | --- | --- |
| Nomad Atlas places | Nomads.com, via `Significant-Hobbies/nomad-data-adventure` | Bundled `public/data/nomad/cities.json` (byte-identical, sha256-checked) and Atlas's `model.js` copied unchanged | Snapshot collected 2026-09-07, published 2026-09-13 (`517cbeb`) |
| High Signal Podcasts | `Significant-Hobbies/on-record` | Public API `api.podcasts.highsignal.app/api` (read-only) | API read-time provenance; collection cadence is separate (below) |
| Reddit Insights | Reddit, via `High-Signal-App/research-subreddit` | Public Snapshot API `reddit-insights.highsignal.app/api/snapshots` (GET only) | Capture windows and revision on every snapshot; 24-hour serving leases |
| PH Catalog | Product Hunt public pages, via `Significant-Hobbies/ph-catalog` | Browser DuckDB-WASM over private R2 Parquet via the Worker | ph-catalog catalog-state, published/exported 2026-10-10; 575,479 products, 93,897 with categories |
| Research Papers | `High-Signal-App/research-papers` | Public GET JSON exports at `papers.highsignal.app` (CC-BY 4.0) | Response Date/Last-Modified or read time; collection date not recorded |

## Collector ownership and refresh workflows (source evidence)

This inventory is the portable documentation portion of [#12](https://github.com/High-Signal-App/techdata/issues/12),
based on public checked-in source/docs reviewed on 2026-10-13. The
[owner recommendation](https://github.com/High-Signal-App/techdata/issues/12#issuecomment-6100217087)
is a recommendation, not finalized approval of a collector architecture.
techdata currently reads through adapters; collector code and writes remain in
the source repos. Repository ownership below means responsibility in checked-in
code/docs, not a verified on-call assignment or proof that a job is enabled.
Configured schedules, suggested cadences, serving leases and successful live
refreshes are different kinds of evidence.

| Collection | Owning source repo | Evidenced refresh cadence/workflow | Export path and techdata handoff |
| --- | --- | --- | --- |
| Nomad Atlas | [Significant-Hobbies/nomad-data-adventure](https://github.com/Significant-Hobbies/nomad-data-adventure) | Completed saved-snapshot experiment; source README states no active collection or expansion roadmap. No recurring refresh is evidenced. | Source `data/nomads_cities.json` and public `cities.json` are byte-identical. techdata bundles `public/data/nomad/cities.json` and the unchanged source `model.js`; local hash/parity tests pin these copies. Current bundled collection date is 2026-09-07. |
| High Signal Podcasts | [Significant-Hobbies/on-record](https://github.com/Significant-Hobbies/on-record) | Checked-in `cron-ingest.yml`: discovery/transcripts daily at 06:00 UTC (11:30 IST), plus Sunday 07:00 UTC (12:30 IST) discovery/transcripts and claim extraction; manual dispatch also exists. These are configured triggers, not verified active runs. | Python ingest writes through the source Worker publication gate; D1 holds records and R2 holds raw material. techdata reads the public `api.podcasts.highsignal.app/api/{stats,episodes,people,claims}` routes, not raw storage or a database dump. Published API data needs no source SSR rebuild. |
| Reddit Insights | [High-Signal-App/research-subreddit](https://github.com/High-Signal-App/research-subreddit) | Historical ingest/analyze/UI pipeline is documented as manual. The daily Worker is explicitly an **undeployed scaffold**, despite its configured 02:17 UTC (07:47 IST) cron. Current forward-collector activation/cutover and actual publication/lease-renewal cadence are unknown from the reviewed evidence. | Daily-v2 archive import verifies source packs and writes minimized gzip derivatives in `artifacts/daily-snapshots/`; publication writes `reddit-insights/exports/v1/index.json` and catalogued derivatives to private storage. techdata reads public `/api/snapshots/catalog` and `/api/snapshots/:date/:subreddit?v=` at `reddit-insights.highsignal.app`, never raw archives. A 24-hour serving lease is an expiry rule, not proof of daily collection. |
| Research Papers | [High-Signal-App/research-papers](https://github.com/High-Signal-App/research-papers) | Operations docs **suggest** daily arXiv/OpenReview, weekly citation graph, and daily overlay/export jobs via host `launchd`. Installed jobs, host timezone, latest successful run and current cadence are unverified. | `papers export-ch` regenerates `web/public/data/*.json` from ClickHouse; docs describe `papers warm-update --build-web` and a subsequent static rebuild/publication. techdata reads public `/data/{top_papers,hot,sleepers,review_top_papers,top_cited_works,top_authors,summary}.json`, `/paths.json` and supported `/paper/:arxiv_id.md` routes at `papers.highsignal.app`, not operator ClickHouse/API state. |
| PH Catalog | [Significant-Hobbies/ph-catalog](https://github.com/Significant-Hobbies/ph-catalog) | Checked-in `daily.yml`: daily 21:47 UTC (03:17 IST next day), self-hosted macOS/ARM64 runner, bounded `daily --limit 500 --workers 2 --rps 0.25`, verification and release export. Enabled scheduler, runner health and successful private export are unverified. | Source generates `producthunt-full.parquet` (seven-field product table) and `ph-catalog-full.tar.zst` (portable catalogue/provenance archive), uploaded to mutable private `catalog-state` release. techdata's allowlisted R2 read path is `/api/files/ph/producthunt-full.parquet`; `public/data/ph/summary.json` is a derived first-paint summary. A source daily release does **not** automatically update either techdata copy. |

### Evidence and unresolved details

The links below pin the reviewed source revisions; they are source evidence,
not new production receipts or instructions to run the collectors.

- **Nomad:** [README at `32ad9ff`](https://github.com/Significant-Hobbies/nomad-data-adventure/blob/32ad9ff23f769483debb023e9a1467ed5a44196d/README.md)
  states the completed/snapshot-only status. [techdata snapshot metadata](src/adapters/nomad/meta.ts)
  retains the original collection date/revision. A future recollection or copy
  refresh needs a separate decision; this inventory does not schedule one.
- **Podcasts:** [workflow at `752b16e`](https://github.com/Significant-Hobbies/on-record/blob/752b16ebf3a954865248596be7fc7ea4756293cf/.github/workflows/cron-ingest.yml),
  [ingest runbook](https://github.com/Significant-Hobbies/on-record/blob/752b16ebf3a954865248596be7fc7ea4756293cf/docs/operations/ingest.md)
  and [README](https://github.com/Significant-Hobbies/on-record/blob/752b16ebf3a954865248596be7fc7ea4756293cf/README.md).
  The runbook's daily `--focus recs` description disagrees with the workflow's
  weekly `--focus all --max-segments 40` extraction step; the table reports the
  checked-in workflow. README also labels the project inactive. Neither cron
  syntax nor an HTTP read timestamp establishes active ingestion or publication.
- **Reddit:** [README at `2c3abee`](https://github.com/High-Signal-App/research-subreddit/blob/2c3abee96e1ec9628c17508821fe30d67b4d272e/README.md),
  [collector activation gate](https://github.com/High-Signal-App/research-subreddit/blob/2c3abee96e1ec9628c17508821fe30d67b4d272e/workers/daily-collector/README.md),
  [scaffold cron](https://github.com/High-Signal-App/research-subreddit/blob/2c3abee96e1ec9628c17508821fe30d67b4d272e/workers/daily-collector/wrangler.jsonc)
  and [ownership/handoff contract](https://github.com/High-Signal-App/research-subreddit/blob/2c3abee96e1ec9628c17508821fe30d67b4d272e/docs/high-signal-integration.md).
  The docs assign canonical collector/archive responsibility to Reddit Insights
  and describe transition from a High Signal-hosted archive. They do not establish
  completed cutover here. The documented publisher renews leases only after an
  authoritative manifest reread; private archive/redaction/renewal receipts remain
  an operator gate. No duplicate collector activation is implied.
- **Papers:** [suggested jobs at `ef940e9`](https://github.com/High-Signal-App/research-papers/blob/ef940e90968391c5f0db624f3468ce23af87fd8f/docs/operations/jobs.md),
  [data/export map](https://github.com/High-Signal-App/research-papers/blob/ef940e90968391c5f0db624f3468ce23af87fd8f/docs/operations/data-map.md)
  and [refresh quality manifest](https://github.com/High-Signal-App/research-papers/blob/ef940e90968391c5f0db624f3468ce23af87fd8f/docs/operations/refresh-manifest.md).
  Suggested host times are 03:00 arXiv, 04:00 OpenReview, 05:00 weekly graph,
  06:00 overlay/export; timezone/installation are not evidenced. Actual watermarks,
  output counts and failures live in the gitignored operator refresh manifest,
  which was not read. techdata's separate `scripts/papers-citations.mjs` produces
  `public/data/papers/citations.json` from public paper lists/OpenAlex; no recurring
  schedule is checked in for that supplemental snapshot, and none is added here.
- **PH:** [daily workflow at `13d3167`](https://github.com/Significant-Hobbies/ph-catalog/blob/13d3167a141f8784d7e350f4000882676871cda8/.github/workflows/daily.yml),
  [README](https://github.com/Significant-Hobbies/ph-catalog/blob/13d3167a141f8784d7e350f4000882676871cda8/README.md)
  and [portable handoff docs](https://github.com/Significant-Hobbies/ph-catalog/blob/13d3167a141f8784d7e350f4000882676871cda8/docs/machine-handoff.md).
  The immutable `catalog-handoff-v1` archive is a separate documented boundary
  from the mutable `catalog-state` release; private assets/checksum receipts were
  not fetched. A [03:15 host-local launchd template](https://github.com/Significant-Hobbies/ph-catalog/blob/13d3167a141f8784d7e350f4000882676871cda8/launchd/local.ph-catalog.daily.plist)
  also exists, but installation and coexistence with Actions are unknown. It is
  not evidence of a second active scheduler. techdata summary generation and
  approved R2 replacement remain separate maintenance steps described below.

**Open gates:** the keep-versus-relocate architecture decision in #12 remains
with the owner, as does any source-site retirement decision in #13. Current
operator/on-call assignments, enabled schedules, private manifests/releases,
credential readiness, last successful collection/publication and live export
freshness remain unverified. A fetched date records a read, not collector success;
missing upstream collection dates stay missing. This documentation phase adds
no freshness enforcement, collector relocation, job activation, schedule/resource/
configuration change, credential provisioning or retirement approval.

## Nomad Atlas parity

Inventory of nomad.significanthobbies.com (`app.js`, `model.js`, `index.html`
at `3ab6a63`) and where each lives in techdata (`/nomad/`).

| Atlas feature | techdata |
| --- | --- |
| Search name/country, accent-insensitive | Filter search (same fold) and ⌘K |
| Region and country filters | Facets with counts (multi-select) |
| Cost profiles: nomad, expat, local, family | Profile toggle; drives cost column, cost filter, median, cards |
| Max monthly cost slider | `cost` range on the selected profile |
| Internet, safety minimums; remote-work-visa checkbox | Ranges and a visa facet |
| Lifestyle & inclusion: walkability, healthcare, English, female, LGBTQ+, nightlife, cleanliness | Ranges under "more filters" |
| Weather snapshot: min/max °C, max AQI | `temp` and `aqi` ranges under "more filters" |
| Quick filters: all, under $1,500, well connected (50+), walkable (4+), remote work visa | Same five presets |
| Card and table views | Both (`view=cards`; phones default to cards) |
| 8 sort orders (overall, lowest cost, internet, safety, walkability, healthcare, nightlife, lowest AQI) | Sort menu plus sortable columns; missing values last, ties by name |
| Pagination ("explore more") | Pages of 50 (table) / 48 (cards) |
| Shareable filter URLs | Every filter, profile, sort, view, open place and shortlist is in the URL; old Atlas links are translated on load |
| Result insights: count, median cost, median internet, countries | Same, above the table |
| Active filter chips, reset, empty state | Library `ActiveFilters`, clear all, empty state |
| City details: four profile costs, every other metric, source link | Record detail panel (sheet on phones) with provenance |
| Unusual-estimate flag (< $100 or > $30,000) | Kept as published, flagged in table, cards, detail and compare |
| Compare up to 3 places across 22 metrics, shortlist bar | Shortlist bar and `/nomad/compare/?places=…` (add/remove there too) |
| Original JSON download | "original json" (byte-identical file) |
| Filtered JSON / CSV export with every source field | Export menu: all 27 source fields, JSON wraps source, collected-at, profile and filters |
| About the data notes | `/nomad/notes/` with dataset counts and checksum |
| Space novelty entries excluded (1,383 → 1,374) | Same |

Parity is tested: `tests/nomad.test.ts` runs 19 Atlas filter/sort
combinations and all presets through Atlas's own `selectCities` and through
techdata, and requires identical slugs in identical order.

Left out on purpose (public-site chrome, not data features): hero art,
newsletter capture, project strip, Ask-AI footer and App Health tracking.

## Podcasts coverage (read-only)

- **Claims** (`/podcasts/claims/`): full-text search with claim type, speaker
  and said-on date filters (newest 50, as the API returns); claim detail with
  the verbatim quote, verified-speaker attribution, timestamp deep link (caption
  transcripts only), transcript window around the quote, evidence, mentions,
  episode source and public claim page.
- **Episodes** (`/podcasts/`): server-paged list with show filter and search;
  detail lists the episode's claims with timestamps.
- **People** (`/podcasts/people/`): verified speakers, server-paged; detail with
  their newest claims and a link to search all of them.
- Unverified speakers are labelled, never named or listed as people (the API
  enforces this; tests check techdata never upgrades them).

## Reddit Insights coverage (read-only)

- **Subreddits** (`/reddit/`): communities from the live catalog, latest recorded
  post/retained-comment counts, coverage and available dates; facets with counts.
- **Threads** (`/reddit/posts/`): chosen community and collection date, searchable
  post table, real post-label facet, recorded score range, score/reply sorting.
  URL state includes the 12-character revision; thread details show body, source
  permalink, reported replies, retained comments and exact UTC collection window.
- Posts and retained-comments CSV/JSON exports carry subreddit, date, full
  revision, captured-at and source on each row. JSON also keeps provenance,
  coverage, window, attribution and applied filters. Posts export the filtered
  view; comments export all retained comments in the selected snapshot.
- Author/profile fields are omitted. Labels use the API's `flair`; no inferred
  topics. Coverage is always shown: retained comments are filtered and scores
  and reply totals are recorded values, never current Reddit values.
- Not-archived, removed revision, expired and unavailable states remain distinct.
  Snapshot reads use no-store and pinned `?v=` requests; global search only searches
  community names plus bounded, already loaded latest snapshots still catalogued.
- `REDDIT_INSIGHTS_API_BASE` can override the public origin (no configuration
  change required). No writes, archive access or collector changes.

## PH Catalog coverage (read-only)

- `/ph/`: 575,479 products (93,897 with categories). The prerendered HTML contains
  the first page by name from the real export, with full-export facet counts.
  DuckDB-WASM starts after paint; the first two pages remain browsable during
  loading. Other URL filters/sorts/pages and product details wait for the engine.
  Browser-only DuckDB-WASM queries
  names/taglines/descriptions with case/accent-insensitive search, category and
  website facets with counts, sorting, URL state, paging and slug-selected detail.
- CSV/JSON exports include all filtered rows and provenance; JSON carries source,
  collectedAt (not recorded), fetchedAt, release revision, export date and filters.
- The full Parquet export loads from `/api/files/ph/producthunt-full.parquet`
  using HTTP range reads; it is not downloaded into a browser buffer first.
- `GET /api/ph/summary` and `/api/collections` expose static full-export provenance;
  product queries stay in the browser.
- Pinned DuckDB-WASM 1.32.0 modules and workers load lazily from
  `/api/files/duckdb/1.32.0/` on the same origin. Capability selection downloads
  only one bundle: the smaller EH on supported browsers, otherwise MVP.
- Full filtered exports are prepared on request, then downloaded through the
  export menu; they do not block the first interactive page.
- Only the DuckDB-WASM path is implemented; the DuckDB-WASM vs D1 benchmark is open.
  The shared ⌘K index lazily merges client `searchPh()` hits with server results.
- No per-row server API, writes, votes or launch dates. Attribution: Product Hunt
  (public product pages), catalogue by ph-catalog. Per-record collection dates are
  absent; the release publication date is not used as a collection date.

Regenerate the small summary using the pinned WASM dependency (no additional
production dependency). The script checks the full SHA-256 and both totals,
uses the same default SQL sort as the browser, and enforces a 150 KiB gzip cap.
DuckDB may download its matching Parquet extension on the first script run.
Keep the downloaded Parquet outside the repository:

```sh
gh release download catalog-state --repo Significant-Hobbies/ph-catalog --pattern producthunt-full.parquet --dir /tmp/techdata-ph-export
node scripts/ph-summary.mjs /tmp/techdata-ph-export/producthunt-full.parquet
```

`public/data/ph/summary.json` contains 100 display rows (descriptions are deferred
to the full engine), category/website counts, totals and release/source provenance.
Astro passes it to the server-rendered React island, so useful rows are in the
HTML before hydration. `ph-query-ready` is a browser performance mark emitted
after the requested full-engine page/detail and its counts/facets resolve; export
preparation is deliberately separate. Saved views, column visibility and filter
URLs use the existing state hooks.

## Research Papers coverage (read-only)

- **Papers** (`/papers/`): merged public top, hot, sleepers and OpenReview
  review lists, keyed by published arXiv/OpenReview ID, with list/category/year/
  venue/decision/topic filters and facet counts, search, sorting, pagination,
  URL state, detail and filtered CSV/JSON exports. Differing list metrics remain
  in the `published` field; top-papers fields take precedence in the merged row.
- Detail shows the published citation count, cites/year, in-corpus degree,
  PageRank/Katz, topics, keywords, reviews, arXiv/OpenReview links, public paper
  Markdown (top 200 only), and actual reading-path memberships.
- **Reading paths** (`/papers/paths/`): readings in source order with authors,
  source links, the path's own `sourceNote` and `trustNote`. A path reading need
  not be in the selected paper export. Authors on paper rows come only from
  published reading-path metadata, not author rankings.
- **Cited works** (`/papers/cited/`) and **authors** (`/papers/authors/`): public
  aggregate rankings, sortable/filterable tables, details and exports.
- Corpus totals in `summary.json` describe the operator snapshot (478,991
  papers and 8,981,698 paper edges), not the number of publicly browsable papers.
  Public paper counts are computed from the merged exports. Missing files are
  labelled explicitly; counts then cover only available files.
- **Citation links on paper details** come from the separate OpenAlex (CC0)
  snapshot, matched by DOI or API-verified arXiv location. References and cited-by
  include only papers in the merged public collection; unmatched or conflicting
  identifiers are labelled. This is separate from the operator corpus metrics.
  Source and fetched date appear next to the links. The static JSON is fetched
  only when a paper detail opens, never for list pages.

Regenerate offline (or with the same command in a scheduler):

```sh
node scripts/papers-citations.mjs
```

The script reads all four public paper lists, batches up to 50 DOI filters,
uses `mailto=techdata@users.noreply.github.com`, makes at most eight requests
per second, and retries network/429/5xx failures with bounded backoff. It verifies
DOI/arXiv identifiers in returned OpenAlex locations, never titles. Failed reads
leave the existing file intact. Output ordering is deterministic for the same
inputs and timestamp; `public/data/papers/citations.json` has a 1.5 MB cap.
Home summaries and the first episode page are also read at build time, with their
actual fetch dates; episodes revalidate through the live API after hydration.
- Attribution: **Research Papers (High Signal), CC-BY 4.0**, via public JSON
  exports. Every API envelope and export carries source and fetched-at;
  collection date is null when unrecorded. Submitted dates, Markdown
  `last_updated` and `paths.generatedAt` are not collection dates. Freshness
  uses response Last-Modified/Date where present, otherwise read time.
- `RESEARCH_PAPERS_BASE` optionally overrides the default public site base.
  Resources load lazily and cache per adapter instance. No operator APIs,
  ClickHouse access, collection or source writes are used.
- API: `/api/papers/papers` (view filter params, `sort=field:asc|desc`,
  `limit`, `offset`), `/api/papers/papers/:id`, `/api/papers/paths`,
  `/api/papers/paths/:id`, `/api/papers/cited-works`, `/api/papers/authors`.

## Architecture

- Astro 7 + React islands, prerendered pages, on one Cloudflare Worker
  (`@astrojs/cloudflare`). `/api/*` is a Hono app (`src/server/app.ts`).
- One adapter per collection under `src/adapters/`; no shared record schema.
  The contract (`types.ts`) is summary, search hits and provenance; each
  adapter keeps its own record shape.
- `GET /api/search?q=&limit=` fans out to server adapters in parallel (5-second
  deadline each) and returns `{hits, collections: [{id, ok, ms, count, error?}],
  provenance}`. Source summaries need no extra upstream reads; record views carry
  dates/revisions. Optional `collection` and `kind` filters remain supported.
  Timeouts retain request-local partial hits when supported.
  Failures return other hits with `no-store`; successful reads use short-lived public caching.
  `src/search/index.ts` ranks and caps hits; ⌘K shares one request per query and
  lazily merges browser-only PH hits into stable collection groups.
- `GET /api/collections`, `/api/nomad/places`
  (same query string as the view), `/api/nomad/places/:slug`, and
  `/api/podcasts/{stats,episodes,episodes/:id,people,people/:slug,claims,claims/:id}`,
  `/api/reddit/catalog` and `/api/reddit/snapshots/:date/:subreddit?v=`.
- UI: `ConsolePage`, `DataTable`, `FilterBar`/`useUrlFilters`, `SearchPalette`,
  `RecordDetail`, `ExportMenu` from `@saas-maker/*` v0.1.14 (git dependency).

## Saved views and compare tray

Every explorer can save its collection URL, filters, sort and visible columns,
or copy the same link for sharing. Saved views appear in a fixed-height sidebar
list with rename/delete controls. Views and pins use schema-validated, versioned
localStorage keys; unavailable storage falls back to session storage, then memory.

Select table rows or pin a record in its details to add it to `/compare/` (up to
24 pins). Nomad's existing shortlist uses “pin selected to tray”; the original
`/nomad/compare/?places=…` view is unchanged. Claims offer a table alongside the
existing quote view. The palette includes a pinned group. Compare retains the
selected record's actual fields and source dates/revision/URL as a local snapshot;
different collections stay in separate groups and unverified speakers stay unnamed.

## Run

Needs Node 22+ and pnpm 10.33.2. `sass-maker/ui-library` is public.

```sh
pnpm install --frozen-lockfile
pnpm dev                 # astro dev (workerd) on http://localhost:4321
pnpm run check           # typecheck, Biome lint, tests, build
pnpm run build && pnpm run preview   # production build on workerd, port 4329
```

Deploy is manual and owner-approved only (`.github/workflows/deploy.yml`,
`workflow_dispatch`). The Worker is public and requires no authentication.
The R2 bucket stays private: do not enable a public bucket endpoint.

Set `PUBLIC_SITE_URL` at build time to the deployment origin, for example
`https://techdata.<account-subdomain>.workers.dev`. The manual workflow reads
it from the repository Actions variable `PUBLIC_SITE_URL`. Astro's `site`
setting uses this value to build self-canonicals without query strings; when
unset, pages omit canonicals rather than using a placeholder host.
`/robots.txt` and `/sitemap.xml` run in the Worker and use the request origin,
including when the build variable is unset. Robots allows pages and disallows
`/api/`; JSON and file responses have no robots header.

Content duplicates the five live source sites: [Nomad Atlas](https://nomad.significanthobbies.com/)
([Nomads.com](https://nomads.com/)), [High Signal Podcasts](https://podcasts.highsignal.app/),
[Reddit Insights](https://reddit-insights.highsignal.app/),
[Product Hunt](https://www.producthunt.com/) (catalogue by [ph-catalog](https://github.com/Significant-Hobbies/ph-catalog)),
and [Research Papers](https://papers.highsignal.app/) (CC-BY 4.0).
The owner deliberately chose indexable pages with techdata self-canonicals on
2026-10-10. Revisit this canonical/indexing choice when those sites retire.

### Private R2 data

`wrangler.jsonc` binds the existing `techdata-data` bucket as `DATA`.
`GET`/`HEAD` `/api/files/*` serves exactly the five objects listed below through
the public Worker; all other keys and directory/list requests return 404.
Reads stream with single-range support. Parquet uses public one-hour caching,
an ETag and conditional 304 responses; versioned DuckDB files use immutable
one-year public caching.

Objects uploaded on 2026-10-10 using `wrangler r2 object put --remote`:

- `ph/producthunt-full.parquet`: full export from
  [ph-catalog catalog-state](https://github.com/Significant-Hobbies/ph-catalog/releases/tag/catalog-state),
  79,066,044 bytes, SHA-256
  `e1d25bc8c46fe0e92c68b51a107702d12c3da87b738cbfdfa8c7cd84424cd006`.
- `duckdb/1.32.0/{duckdb-eh.wasm,duckdb-mvp.wasm,duckdb-browser-eh.worker.js,duckdb-browser-mvp.worker.js}`:
  copied from `@duckdb/duckdb-wasm` 1.32.0 `dist`.

Upload command shape (documentation only; uploads require owner approval):

```sh
wrangler r2 object put techdata-data/ph/producthunt-full.parquet --remote --file <export.parquet> --content-type application/octet-stream
wrangler r2 object put techdata-data/duckdb/1.32.0/duckdb-eh.wasm --remote --file <dist/duckdb-eh.wasm> --content-type application/wasm
wrangler r2 object put techdata-data/duckdb/1.32.0/duckdb-browser-eh.worker.js --remote --file <dist/duckdb-browser-eh.worker.js> --content-type application/javascript
```

The MVP files use the same respective content types. The route preserves stored
Content-Type metadata and adds `nosniff`; keep upload metadata correct.

## What's next

1. Owner decisions: deployment origin (`PUBLIC_SITE_URL`), deploy approval.
2. DuckDB-WASM vs D1 benchmark.
3. Parity sign-off per collection, then decide the public sites' fate.
