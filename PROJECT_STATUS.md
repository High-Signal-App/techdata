# techdata — PROJECT STATUS

Last updated: 2026-10-09

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
- High Signal Podcasts public API (`api.podcasts.highsignal.app`).

### Internal

- `sass-maker/ui-library` v0.1.11 (git dependency).
- `Significant-Hobbies/nomad-data-adventure`, `Significant-Hobbies/on-record` (read-only sources).

## Timeline

- 2026-10-09 — owner named techdata and chose the repo (ph-catalog#14).
- 2026-10-09 — slice 1: shell, ⌘K search, Nomad Atlas at parity, Podcasts read-only. Verified locally; not deployed.

## Products

- Web console (private, not deployed).

## Features (shipped)

- Collections overview with counts and provenance.
- Nomad Atlas places: all Atlas filters, presets, profiles, sorts, table/cards, details, compare-3, exports, data notes; old Atlas links translate.
- Podcasts: claims search, episodes, people, claim detail with quote, speaker attribution, timestamp links and transcript window.
- ⌘K search across both collections.

## Todo / Planned / Deferred / Blocked

1. Blocked on owner: domain, Cloudflare Access, deploy approval, `UI_LIBRARY_TOKEN` CI secret.
2. Planned: Reddit Insights adapter; Research Papers adapter; PH Catalog query.
3. Deferred: fate of the five public sites; collector location.
