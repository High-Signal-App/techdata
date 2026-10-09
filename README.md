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

Next: Reddit Insights, Research Papers, PH Catalog (see "What's next").

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

## Architecture

- Astro 7 + React islands, prerendered pages, on one Cloudflare Worker
  (`@astrojs/cloudflare`). `/api/*` is a Hono app (`src/server/app.ts`).
- One adapter per collection under `src/adapters/`; no shared record schema.
  The contract (`types.ts`) is summary, search hits and provenance; each
  adapter keeps its own record shape.
- `GET /api/collections`, `/api/search?q=&collection=`, `/api/nomad/places`
  (same query string as the view), `/api/nomad/places/:slug`, and
  `/api/podcasts/{stats,episodes,episodes/:id,people,people/:slug,claims,claims/:id}`.
- UI: `ConsolePage`, `DataTable`, `FilterBar`/`useUrlFilters`, `SearchPalette`,
  `RecordDetail`, `ExportMenu` from `@saas-maker/*` v0.1.7 (git dependency).

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
2. Reddit Insights adapter (R2 snapshots, pinned revisions, redaction).
3. Research Papers adapter (paths, paper detail, citation graph).
4. PH Catalog hosted query (Parquet in R2; DuckDB-WASM vs D1 benchmark).
5. Parity sign-off per collection, then decide the public sites' fate.
