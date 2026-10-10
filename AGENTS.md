## Shared Fleet Standard

Also read and follow the shared fleet-level agent standard at `../AGENTS.md`.
Treat this repository as owned product code: keep changes scoped, verify work,
and record durable follow-up in this repo's GitHub Issues.

## Project

- **What**: techdata, a public, indexable data workbench (plan:
  Significant-Hobbies/ph-catalog#14).
- **Stack**: Astro 7 + React islands on one Cloudflare Worker; Hono for
  `/api/*`; SaaS Maker UI (`@saas-maker/*`, git dependency pinned to a tag).
- **Local dev**: `pnpm install --frozen-lockfile`, `pnpm dev`.
- **Checks**: `pnpm run check` (typecheck, Biome via `pnpm exec biome`, Vitest,
  build). Never `npx biome`.
- **Deploy**: manual `workflow_dispatch` only, after explicit owner approval.
  Worker is public with no authentication; `techdata-data` stays private and
  is served only through allowlisted Worker routes. Do not create Cloudflare
  resources without approval.

## Rules

- One adapter per collection; no shared record schema.
- techdata reads only. Collectors and writes stay in the source repos until
  parity is signed off.
- Every record shown or exported keeps its source and collected/fetched date.
- `src/adapters/nomad/model.js` and `public/data/nomad/cities.json` are copies
  of nomad-data-adventure; tests pin their hashes. Do not edit them here.
- Podcasts: never show a speaker name the API did not verify.
- Library changes go to `sass-maker/ui-library`, not local forks.

## Visual work

Keep the Console template's quiet look. Check rendered pages at 1440 and 390.
