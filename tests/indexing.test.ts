import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { publicPaths } from "../src/lib/public-readability";
import { baseSitemap, sitemapChunks } from "../src/lib/publication-sitemaps";
import { GET as robots, prerender as robotsPrerender } from "../src/pages/robots.txt";
import { GET as sitemap, prerender as sitemapPrerender } from "../src/pages/sitemap.xml";

const context = (url: string, site?: string) =>
  ({ request: new Request(url), site: site ? new URL(site) : undefined }) as APIContext;

describe("public indexing endpoints", () => {
  it.each(["https://data.highsignal.app", "https://techdata.account.workers.dev"])(
    "uses the configured canonical origin for crawl instructions on %s",
    async (origin) => {
      const canonical = "https://data.highsignal.app";
      const crawl = await robots(context(`${origin}/robots.txt?ignored=1`, canonical));
      expect(robotsPrerender).toBe(false);
      const policy = await crawl.text();
      expect(policy).toContain(`Sitemap: ${canonical}/sitemap.xml`);
      for (const bot of ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider"])
        expect(policy).toContain(`User-agent: ${bot}\nAllow: /\nDisallow: /api/`);
      expect(crawl.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(crawl.headers.get("x-robots-tag")).toBeNull();
      const map = await sitemap(context(`${origin}/sitemap.xml?ignored=1`, canonical));
      expect(sitemapPrerender).toBe(false);
      expect(map.headers.get("content-type")).toBe("application/xml; charset=utf-8");
      expect(map.headers.get("x-robots-tag")).toBeNull();
      const xml = await map.text();
      const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
      expect(locations.sort()).toEqual(sitemapChunks.map((chunk) => `${canonical}/sitemaps/${chunk}.xml`).sort());
      expect(xml).toContain("<sitemapindex");
      const base = await baseSitemap(canonical).text();
      for (const path of publicPaths) expect(base).toContain(`<loc>${canonical}${path}</loc>`);
      expect(xml).not.toContain("/api/");
      expect(locations.every((location) => new URL(location).search === "")).toBe(true);
    },
  );

  it("uses the request origin in a local build without a configured site", async () => {
    const origin = "http://localhost:4321";
    const crawl = await robots(context(`${origin}/robots.txt`));
    expect(await crawl.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
    const map = await sitemap(context(`${origin}/sitemap.xml`));
    expect(await map.text()).toContain(`<loc>${origin}/sitemaps/pages.xml</loc>`);
  });
});
