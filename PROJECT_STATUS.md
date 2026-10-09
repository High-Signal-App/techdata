# techdata — PROJECT STATUS

Last updated: 2026-10-10

## Why / What

A private data workbench that replaces five separate data surfaces with one
entry point. Each collection keeps its own collector and record shape; techdata
reads them through adapters and adds search, filters, comparison and exports
with provenance.

**Users:** the owner.

**IN scope:** browsing, search, comparison and export over owned collections;
provenance on every record.

**OUT of scope (for now):** collection, writes to sources, public pages.

## Dependencies

### External

- Nomads.com data (saved snapshot via Nomad Atlas).
- Reddit Insights public Snapshot API (`reddit-insights.highsignal.app`), read-only.
- High Signal Podcasts public API (`api.podcasts.highsignal.app`).
- Research Papers public JSON exports (`papers.highsignal.app`, CC-BY 4.0).

### Internal

- `sass-maker/ui-library` v0.1.11 (git dependency).
- `Significant-Hobbies/nomad-data-adventure`, `Significant-Hobbies/on-record` (read-only sources).

## Timeline

- 2026-10-09 — owner named techdata and chose the repo (ph-catalog#14).
- 2026-10-09 — slice 1: shell, ⌘K search, Nomad Atlas at parity, Podcasts read-only. Verified locally; not deployed.

- 2026-10-10 — Research Papers public-export adapter and views added. Typecheck, Biome and 43 offline tests pass; full build blocked by sandbox listener EPERM at port 9229. Rendered review at 1440/390 remains unverified. Not deployed.

## Products

- Web console (private, not deployed).

## Features (shipped)

- PH Catalog (implemented locally; build/rendered browser verification blocked by sandbox): sample: 2,000 of 574,752 products; browser DuckDB-WASM Parquet queries, category/website facets, URL state, sorting, paging, product detail and filtered CSV/JSON exports with provenance. Static collection summary; client search available, global palette wiring deferred. Typecheck, Biome and 53 Vitest tests pass; `pnpm run check` stops at Cloudflare build `listen EPERM` on port 9229. Browser engine/rendering are unverified offline; Node WASM Parquet ingestion requires an unavailable extension, so SQL builders/contracts are unit-tested and the real sample schema/count were checked with local DuckDB.

- Collections overview with counts and provenance.
- Nomad Atlas places: all Atlas filters, presets, profiles, sorts, table/cards, details, compare-3, exports, data notes; old Atlas links translate.
- Podcasts: claims search, episodes, people, claim detail with quote, speaker attribution, timestamp links and transcript window.
<<<<<<< HEAD
- Research Papers: merged public paper lists, citation/review metrics, attributed reading paths, cited works, authors, URL filters, details and provenance exports.
- ⌘K search includes Research Papers.
||||||| a225c94
- ⌘K search across both collections.
=======
- Reddit Insights: catalog communities, pinned captured threads and discussion, coverage and window provenance, posts/comments exports; fixture-backed adapter/API tests. Local typecheck, lint and tests pass; full build and rendered review are blocked by sandbox socket restrictions (`listen EPERM`). Live reads remain unverified (offline task).
- ⌘K search across Nomad, Podcasts and Reddit (community names and already loaded latest threads).
>>>>>>> origin/main

## Todo / Planned / Deferred / Blocked

1. Blocked on owner: domain, Cloudflare Access, deploy approval, `UI_LIBRARY_TOKEN` CI secret.
<<<<<<< HEAD
2. Planned: Reddit Insights adapter; PH Catalog query.
3. Research Papers data gap: citation edges are not in the public export (operator ClickHouse only); no per-paper edge lists or full-corpus browsing.
4. Deferred: fate of the five public sites; collector location.
||||||| a225c94
2. Planned: Reddit Insights adapter; Research Papers adapter; PH Catalog query.
3. Deferred: fate of the five public sites; collector location.
=======
2. Planned: Research Papers adapter; PH full-export hosting, jsDelivr/CSP deploy decision and DuckDB-WASM vs D1 benchmark.
3. Deferred: fate of the five public sites; collector location.
>>>>>>> origin/main
