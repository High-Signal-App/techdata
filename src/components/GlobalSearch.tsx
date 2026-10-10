import { SearchPalette, type SearchResult, type SearchSource } from "@saas-maker/ui/blocks/search-palette";
import * as React from "react";
import { pinKey } from "../lib/compare";
import { usePins } from "../lib/local-lists";
import { COLLECTIONS, fold, groupResults, mergeResults, type SearchHit, type SearchResponse } from "../search";

type QueryResult = {
  server: Promise<SearchHit[]>;
  ph: SearchHit[];
  phState: "loading" | "ready" | "unavailable";
};

/** Collection groups share one server request; PH loads only on an open-palette query. */
export default function GlobalSearch() {
  const { items: pins } = usePins();
  const cache = React.useRef(new Map<string, QueryResult>());
  const open = React.useRef(false);
  const [revision, refresh] = React.useReducer((n: number) => n + 1, 0);
  const results = React.useCallback((q: string) => {
    let result = cache.current.get(q);
    if (!result) {
      result = {
        server: fetch(`/api/search?q=${encodeURIComponent(q)}`)
          .then((r) => (r.ok ? (r.json() as Promise<SearchResponse>) : { hits: [], collections: [], provenance: {} }))
          .then((d) => d.hits)
          .catch(() => []),
        ph: [],
        phState: "loading",
      };
      cache.current.set(q, result);
      const current = result;
      void import("../adapters/ph/query")
        .then(({ searchPh }) => searchPh(q, 8))
        .then((hits) => {
          current.ph = hits;
          current.phState = "ready";
        })
        .catch(() => {
          current.phState = "unavailable";
        })
        .finally(() => {
          if (open.current && cache.current.get(q) === current) refresh();
        });
    }
    return result;
  }, []);

  const sources = React.useMemo<SearchSource[]>(() => {
    // PH completion refreshes palette sources; cached server promises prevent another request.
    void revision;
    return [
      {
        id: "pinned",
        label: "pinned",
        search: (q: string) =>
          pins
            .filter((p) => fold(p.title).includes(fold(q.trim())))
            .map((p) => ({ id: pinKey(p), title: p.title, subtitle: p.provenance.source, href: p.href })),
      },
      ...COLLECTIONS.map((collection) => ({
        id: collection.id,
        label: collection.label,
        search: async (q: string): Promise<SearchResult[]> => {
          if (!open.current || !q.trim()) return [];
          const result = results(q);
          if (collection.id === "ph" && result.phState !== "ready") {
            return [
              {
                id: "ph-status",
                title: result.phState === "loading" ? "Loading PH Catalog…" : "PH catalog unavailable",
              },
            ];
          }
          const merged = mergeResults(await result.server, result.ph, q);
          return (groupResults(merged).find((g) => g.id === collection.id)?.hits ?? []).map((h) => ({
            id: `${h.kind}:${h.id}`,
            title: h.title,
            subtitle: [h.kind === "posts" ? "loaded threads" : h.kind, h.subtitle].filter(Boolean).join(" · "),
            meta: h.meta,
            href: h.href,
          }));
        },
      })),
    ];
  }, [results, revision, pins]);

  return (
    <SearchPalette
      sources={sources}
      onOpenChange={(value) => {
        open.current = value;
        if (!value) cache.current.clear();
      }}
      placeholder="Search Nomad, Podcasts, Reddit, Papers and PH Catalog…"
      emptyHint="Search Nomad Atlas, High Signal Podcasts, Reddit communities or loaded threads, Research Papers and PH Catalog."
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
