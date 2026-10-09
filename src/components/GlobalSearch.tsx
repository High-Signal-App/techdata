import { SearchPalette, type SearchResult, type SearchSource } from "@saas-maker/ui/blocks/search-palette";
import * as React from "react";
import type { SearchHit } from "../adapters/types";

/**
 * ⌘K across every collection. Each collection is one request to /api/search
 * (so a slow source never holds back the others); the kinds it returns are
 * split into palette groups.
 */
const GROUPS: { id: string; label: string; collection: string; kind: string }[] = [
<<<<<<< HEAD
  { id: "papers", label: "papers · research papers", collection: "papers", kind: "papers" },
||||||| a225c94
=======
  { id: "reddit-communities", label: "subreddits · reddit insights", collection: "reddit", kind: "communities" },
  { id: "reddit-posts", label: "loaded threads · reddit insights", collection: "reddit", kind: "posts" },
>>>>>>> origin/main
  { id: "places", label: "places · nomad atlas", collection: "nomad", kind: "places" },
  { id: "countries", label: "countries · nomad atlas", collection: "nomad", kind: "countries" },
  { id: "people", label: "people · podcasts", collection: "podcasts", kind: "people" },
  { id: "claims", label: "claims · podcasts", collection: "podcasts", kind: "claims" },
];

export default function GlobalSearch() {
  const cache = React.useRef(new Map<string, Promise<SearchHit[]>>());
  const hits = React.useCallback((collection: string, q: string) => {
    const key = `${collection}\u0000${q}`;
    let p = cache.current.get(key);
    if (!p) {
      p = fetch(`/api/search?collection=${collection}&q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ hits: SearchHit[] }>) : { hits: [] }))
        .then((d) => d.hits)
        .catch(() => []);
      cache.current.set(key, p);
    }
    return p;
  }, []);

  const sources = React.useMemo<SearchSource[]>(
    () =>
      GROUPS.map((g) => ({
        id: g.id,
        label: g.label,
        search: async (q: string): Promise<SearchResult[]> =>
          (await hits(g.collection, q))
            .filter((h) => h.kind === g.kind)
            .map((h) => ({ id: h.id, title: h.title, subtitle: h.subtitle, meta: h.meta, href: h.href })),
      })),
    [hits],
  );

  return (
    <SearchPalette
      sources={sources}
<<<<<<< HEAD
      placeholder="Search places, countries, people, claims and papers…"
      emptyHint="Search Nomad Atlas places and High Signal Podcasts people and claims, and Research Papers."
||||||| a225c94
      placeholder="Search places, countries, people and claims…"
      emptyHint="Search Nomad Atlas places and High Signal Podcasts people and claims."
=======
      placeholder="Search places, people, claims and subreddits…"
      emptyHint="Search Nomad Atlas, Podcasts and Reddit communities or recently loaded threads."
>>>>>>> origin/main
      onSelect={(r) => {
        if (!r.href) return;
        const target = new URL(r.href, location.href);
        if (target.pathname === location.pathname) {
          // Same view: update the URL and let the island re-read it.
          history.pushState(null, "", target.pathname + target.search);
          dispatchEvent(new PopStateEvent("popstate"));
        } else {
          location.assign(target.href);
        }
      }}
    />
  );
}
