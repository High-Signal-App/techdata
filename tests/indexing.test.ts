import { readdirSync } from "node:fs";
import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { GET as robots, prerender as robotsPrerender } from "../src/pages/robots.txt";
import { GET as sitemap, prerender as sitemapPrerender } from "../src/pages/sitemap.xml";

const context = (url: string) => ({ request: new Request(url) }) as APIContext;
const views = readdirSync(new URL("../src/pages/", import.meta.url), { recursive: true })
  .map(String)
  .filter((path) => path.endsWith(".astro"));

describe("public indexing endpoints", () => {
  it.each(["https://techdata.example", "https://techdata.account.workers.dev"])(
    "uses the request origin %s for crawl instructions and every page URL",
    async (origin) => {
      const crawl = await robots(context(`${origin}/robots.txt?ignored=1`));
      expect(robotsPrerender).toBe(false);
      expect(await crawl.text()).toBe(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
      expect(crawl.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(crawl.headers.get("x-robots-tag")).toBeNull();
      const map = await sitemap(context(`${origin}/sitemap.xml?ignored=1`));
      expect(sitemapPrerender).toBe(false);
      expect(map.headers.get("content-type")).toBe("application/xml; charset=utf-8");
      expect(map.headers.get("x-robots-tag")).toBeNull();
      const xml = await map.text();
      const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
      const paths = views.map((view) =>
        view === "index.astro" ? "/" : `/${view.replace(/(?:\/index)?\.astro$/, "")}/`,
      );
      expect(locations.sort()).toEqual(paths.map((path) => `${origin}${path}`).sort());
      expect(locations).toHaveLength(14);
      expect(xml).not.toContain("/api/");
      expect(locations.every((location) => new URL(location).search === "")).toBe(true);
    },
  );
});
