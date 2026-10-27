import type { APIRoute } from "astro";
import { publicPaths } from "../lib/public-readability";

export const prerender = false;

const paths = publicPaths;
const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const GET: APIRoute = ({ request, site }) => {
  const origin = site?.origin ?? new URL(request.url).origin;
  const urls = paths.map((path) => `<url><loc>${escapeXml(new URL(path, origin).href)}</loc></url>`).join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    },
  );
};
