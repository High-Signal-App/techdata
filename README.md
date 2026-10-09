# techdata

The owner's private data workbench: one console over several data collections,
each read through its own adapter, with search, filters, comparison and
exports that carry their source and collection date. It is the first product
built on the SaaS Maker UI library (`sass-maker/ui-library`, Console template).

Plan and decisions: [Significant-Hobbies/ph-catalog#14](https://github.com/Significant-Hobbies/ph-catalog/issues/14).
Collectors stay in their own repos; techdata only reads until parity is proven.

## Collections

| Collection | Source | Read via | Freshness |
| --- | --- | --- | --- |
| Nomad Atlas places | Nomads.com, via `Significant-Hobbies/nomad-data-adventure` | Bundled `public/data/nomad/cities.json` (byte-identical, sha256-checked) and Atlas's `model.js` copied unchanged | Snapshot collected 2026-09-07, published 2026-09-13 (`517cbeb`) |
| High Signal Podcasts | `Significant-Hobbies/on-record` | Public API `api.podcasts.highsignal.app/api` (read-only) | Live; every response records when it was read |
| Reddit Insights | Reddit, via `High-Signal-App/research-subreddit` | Public Snapshot API `reddit-insights.highsignal.app/api/snapshots` (GET only) | Capture windows and revision on every snapshot; 24-hour serving leases |
| PH Catalog | Product Hunt public pages, via `Significant-Hobbies/ph-catalog` | Browser DuckDB-WASM over configurable Parquet (local sample) | Catalogue handoff v1, published 2026-08-31; sample: 2,000 of 574,752 products |
| Research Papers | `High-Signal-App/research-papers` | Public GET JSON exports at `papers.highsignal.app` (CC-BY 4.0) | Response Date/Last-Modified or read time; collection date not recorded |

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

- `/ph/`: sample: 2,000 of 574,752 products. Browser-only DuckDB-WASM queries
  names/taglines/descriptions with case/accent-insensitive search, category and
  website facets with counts, sorting, URL state, paging and slug-selected detail.
- CSV/JSON exports include all filtered rows and provenance; JSON carries source,
  collectedAt (not recorded), fetchedAt, release revision, sample label and filters.
- `PUBLIC_PH_PARQUET_URL` is a build-time override (default `/data/ph/sample.parquet`).
  The full private release export is not bundled. R2 hosting remains a later step.
- `GET /api/ph/summary` and `/api/collections` expose static sample provenance;
  product queries stay in the browser.
- Pinned DuckDB-WASM 1.32.0 bundles load lazily from jsDelivr in the browser;
  no large WASM assets are shipped to Cloudflare. CDN/CSP choice needs deploy review.
- Only the DuckDB-WASM path is implemented; the DuckDB-WASM vs D1 benchmark is open.
  Client `searchPh()` is available for a later shared index; the palette is unchanged.
- No per-row server API, writes, votes or launch dates. Attribution: Product Hunt
  (public product pages), catalogue by ph-catalog. Per-record collection dates are
  absent; the release publication date is not used as a collection date.

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
- **Citation edges are not in the public export (operator ClickHouse only).**
  References/citations here are published aggregate metrics, top cited works
  and readings inside paths. No per-paper reference/citation lists are invented.
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
- `GET /api/collections`, `/api/search?q=&collection=`, `/api/nomad/places`
  (same query string as the view), `/api/nomad/places/:slug`, and
  `/api/podcasts/{stats,episodes,episodes/:id,people,people/:slug,claims,claims/:id}`,
  `/api/reddit/catalog` and `/api/reddit/snapshots/:date/:subreddit?v=`.
- UI: `ConsolePage`, `DataTable`, `FilterBar`/`useUrlFilters`, `SearchPalette`,
  `RecordDetail`, `ExportMenu` from `@saas-maker/*` v0.1.11 (git dependency).

## Run

Needs Node 22+, pnpm 10.33.2 and read access to the private
`sass-maker/ui-library` repo.

```sh
pnpm install --frozen-lockfile
pnpm dev                 # astro dev (workerd) on http://localhost:4321
pnpm run check           # typecheck, Biome lint, tests, build
pnpm run build && pnpm run preview   # production build on workerd, port 4329
```

Deploy is manual and owner-approved only (`.github/workflows/deploy.yml`,
`workflow_dispatch`). Nothing is deployed yet; no Cloudflare resources exist.

## What's next

1. Owner decisions: domain, Cloudflare Access policy, deploy approval.
2. PH Catalog full-export hosting (Parquet in R2; DuckDB-WASM vs D1 benchmark).
3. Parity sign-off per collection, then decide the public sites' fate.
