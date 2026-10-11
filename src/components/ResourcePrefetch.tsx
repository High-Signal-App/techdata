import { prefetch, resourceClient } from "@saas-maker/ui/lib/use-resource";
import { useEffect } from "react";
import { fetchJson } from "../lib/resource";

/** Warm likely next collections after the current screen has painted. */
export default function ResourcePrefetch() {
  useEffect(() => {
    const warm = () => {
      const urls = location.pathname.startsWith("/podcasts")
        ? ["/api/podcasts/claims?", "/api/podcasts/episodes?limit=50&offset=0"]
        : location.pathname.startsWith("/papers")
          ? ["/api/papers/paths", "/api/papers/authors"]
          : ["/api/podcasts/claims?", "/api/papers/papers?limit=2000"];
      for (const url of urls) {
        if (Date.now() - resourceClient.entry(url, { persist: { ttl: 300_000 } }).snapshot.updated < 30_000) continue;
        void prefetch(url, (signal) => fetchJson(url, signal), { persist: { ttl: 300_000 } });
      }
    };
    if ("requestIdleCallback" in window) {
      const idle = window.requestIdleCallback(warm);
      return () => window.cancelIdleCallback(idle);
    }
    const timer = setTimeout(warm, 1000);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
