import type { APIRoute } from "astro";
import { phPublication } from "./ph-publication";
import { publicPaths } from "./public-readability";
import { PUBLIC_ORIGIN } from "./site";

export const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
export const sitemapChunks = ["pages", "podcasts", ...phPublication.sitemapChunks];
export function sitemapResponse(paths: string[], index = false) {
  const tag = index ? "sitemap" : "url";
  const root = index ? "sitemapindex" : "urlset";
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<${tag}><loc>${escapeXml(new URL(path, PUBLIC_ORIGIN).href)}</loc></${tag}>`).join("")}</${root}>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
  );
}
export function baseSitemap() {
  return sitemapResponse([...publicPaths]);
}

export function createChunkSitemapHandler(read: {
  ph: (chunk: string) => Promise<string[] | null>;
  podcasts: () => Promise<string[]>;
}): APIRoute {
  return async ({ params }) => {
    if (params.chunk === "pages") return baseSitemap();
    try {
      if (params.chunk === "podcasts") {
        const response = sitemapResponse(await read.podcasts());
        response.headers.set("Cache-Control", "public, max-age=60");
        return response;
      }
      const paths = await read.ph(params.chunk ?? "");
      return paths
        ? sitemapResponse(paths)
        : new Response("Not found", {
            status: 404,
            headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" },
          });
    } catch {
      return new Response("Snapshot unavailable", {
        status: 503,
        headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" },
      });
    }
  };
}
