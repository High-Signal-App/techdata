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

## Products

- Web console (private, not deployed).

## Features (shipped)

- PH Catalog: full export of 575,479 products (93,897 with categories), revision `catalog-state-2026-10-10`. Browser DuckDB-WASM uses Worker-served HTTP range reads from private R2; pinned 1.32.0 binaries use the same route. Category/website facets, URL state, sorting, paging, product detail and filtered CSV/JSON exports retain provenance. Static collection summary; client search lazily merges into the shared global palette. Typecheck, Biome and all 102 Vitest tests pass; `pnpm run check` passes. Live R2/Access and browser loading remain unverified in this task.

- Collections overview with counts and provenance.
- Nomad Atlas places: all Atlas filters, presets, profiles, sorts, table/cards, details, compare-3, exports, data notes; old Atlas links translate.
- Podcasts: claims search, episodes, people, claim detail with quote, speaker attribution, timestamp links and transcript window.
- Reddit Insights: catalog communities, pinned captured threads and discussion, coverage and window provenance, posts/comments exports; fixture-backed adapter/API tests. Local typecheck, lint and tests pass; full build and rendered review are blocked by sandbox socket restrictions (`listen EPERM`). Live reads remain unverified (offline task).
- Research Papers: merged public paper lists, citation/review metrics, attributed reading paths, cited works, authors, URL filters, details and provenance exports.
- Shared search index shipped locally: accent/case folding, stable relevance ranking, collection/global caps and collection groups. ⌘K uses one parallel, timeout-isolated `/api/search` request per query plus lazy browser PH search, across Nomad, Podcasts, Reddit (community names and already loaded latest threads), Research Papers and PH Catalog. Source summaries and per-adapter status accompany API hits. Typecheck, Biome and fixture/contract tests pass; full build and 1440/390 rendered review remain blocked by sandbox socket restrictions.

## Todo / Planned / Deferred / Blocked

1. Blocked on owner: domain, Cloudflare Access, deploy approval.
2. Planned: verify private R2/Access browser loading after approved deployment; DuckDB-WASM vs D1 benchmark.
3. Research Papers data gap: citation edges are not in the public export (operator ClickHouse only); no per-paper edge lists or full-corpus browsing.
4. Deferred: fate of the five public sites; collector location.
