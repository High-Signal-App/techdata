import { prefetch, resourceClient } from "@saas-maker/ui/lib/use-resource";
import { useEffect } from "react";
import { fetchJson } from "../lib/resource";

/** Warm an intended next collection without competing with the current view. */
export default function ResourcePrefetch() {
  useEffect(() => {
    const warm = (event: Event) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.origin !== location.origin) return;
      const urls = link.pathname.startsWith("/podcasts")
        ? ["/api/podcasts/claims?", "/api/podcasts/episodes?limit=50&offset=0"]
        : link.pathname.startsWith("/papers")
          ? ["/api/papers/paths", "/api/papers/authors", "/api/papers/papers?limit=2000"]
          : [];
      for (const url of urls) {
        if (Date.now() - resourceClient.entry(url, { persist: { ttl: 300_000 } }).snapshot.updated < 30_000) continue;
        void prefetch(url, (signal) => fetchJson(url, signal), { persist: { ttl: 300_000 } });
      }
    };
    document.addEventListener("pointerover", warm);
    document.addEventListener("focusin", warm);
    return () => {
      document.removeEventListener("pointerover", warm);
      document.removeEventListener("focusin", warm);
    };
  }, []);
  return null;
}
