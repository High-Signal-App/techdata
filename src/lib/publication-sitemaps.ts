import { phPublication } from "./ph-publication";
import { publicPaths } from "./public-readability";

export const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
export const sitemapChunks = ["pages", "podcasts", ...phPublication.sitemapChunks];
export function sitemapResponse(paths: string[], origin: string, index = false) {
  const tag = index ? "sitemap" : "url";
  const root = index ? "sitemapindex" : "urlset";
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<${tag}><loc>${escapeXml(new URL(path, origin).href)}</loc></${tag}>`).join("")}</${root}>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
  );
}
export function baseSitemap(origin: string) {
  return sitemapResponse([...publicPaths], origin);
}
