import { readdirSync } from "node:fs";
import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { GET as robots, prerender as robotsPrerender } from "../src/pages/robots.txt";
import { GET as sitemap, prerender as sitemapPrerender } from "../src/pages/sitemap.xml";

const context = (url: string, site?: string) =>
  ({ request: new Request(url), site: site ? new URL(site) : undefined }) as APIContext;
const views = readdirSync(new URL("../src/pages/", import.meta.url), { recursive: true })
  .map(String)
  .filter((path) => path.endsWith(".astro") && !["compare.astro", "nomad/compare.astro"].includes(path));

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
      const paths = views.map((view) =>
        view === "index.astro" ? "/" : `/${view.replace(/(?:\/index)?\.astro$/, "")}/`,
      );
      expect(locations.sort()).toEqual(paths.map((path) => `${canonical}${path}`).sort());
      expect(locations).toHaveLength(13);
      expect(xml).not.toContain("/api/");
      expect(locations.every((location) => new URL(location).search === "")).toBe(true);
    },
  );

  it("uses the request origin in a local build without a configured site", async () => {
    const origin = "http://localhost:4321";
    const crawl = await robots(context(`${origin}/robots.txt`));
    expect(await crawl.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
    const map = await sitemap(context(`${origin}/sitemap.xml`));
    expect(await map.text()).toContain(`<loc>${origin}/</loc>`);
  });
});
