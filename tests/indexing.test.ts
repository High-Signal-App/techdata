import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { publicPaths } from "../src/lib/public-readability";
import { baseSitemap, createChunkSitemapHandler, sitemapChunks } from "../src/lib/publication-sitemaps";
import { PUBLIC_ORIGIN, pageCanonical } from "../src/lib/site";
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
      const base = await baseSitemap().text();
      for (const path of publicPaths) expect(base).toContain(`<loc>${canonical}${path}</loc>`);
      expect(xml).not.toContain("/api/");
      expect(locations.every((location) => new URL(location).search === "")).toBe(true);
    },
  );

  it.each(["http://localhost:4321", "https://preview.account.workers.dev"])(
    "pins the product origin without build-site configuration on %s",
    async (origin) => {
      const crawl = await robots(context(`${origin}/robots.txt`));
      expect(await crawl.text()).toContain(`Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml`);
      const map = await sitemap(context(`${origin}/sitemap.xml`));
      expect(await map.text()).toContain(`<loc>${PUBLIC_ORIGIN}/sitemaps/pages.xml</loc>`);
    },
  );
  it("keeps entity canonicals and every sitemap chunk on the product domain through an alternate host", async () => {
    const alias = "https://preview.account.workers.dev";
    const handler = createChunkSitemapHandler({
      ph: async (chunk) => (chunk === "ph-1" ? ["/ph/products/00/"] : null),
      podcasts: async () => ["/podcasts/episodes/episode-1/"],
    });
    for (const chunk of ["pages", "ph-1", "podcasts"]) {
      const response = await handler({
        ...context(`${alias}/sitemaps/${chunk}.xml`, alias),
        params: { chunk },
      } as APIContext);
      expect(response.status).toBe(200);
      const xml = await response.text();
      expect(xml).toContain(`<loc>${PUBLIC_ORIGIN}/`);
      expect(xml).not.toContain(alias);
    }
    expect(pageCanonical(new URL(`${alias}/ph/products/00/?ignored=1`).pathname)).toBe(
      `${PUBLIC_ORIGIN}/ph/products/00/`,
    );
    expect(pageCanonical("/ph/products/missing/", true)).toBeUndefined();
    const unknown = await handler({
      ...context(`${alias}/sitemaps/missing.xml`),
      params: { chunk: "missing" },
    } as APIContext);
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("x-robots-tag")).toBe("noindex");
    const failed = await createChunkSitemapHandler({
      ph: async () => {
        throw Error("offline");
      },
      podcasts: async () => {
        throw Error("offline");
      },
    })({ ...context(`${alias}/sitemaps/ph-1.xml`), params: { chunk: "ph-1" } } as APIContext);
    expect(failed.status).toBe(503);
    expect(failed.headers.get("x-robots-tag")).toBe("noindex");
    expect(await failed.text()).not.toContain("<loc>");
  });
});
