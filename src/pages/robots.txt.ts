import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = ({ request }) =>
  new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${new URL(request.url).origin}/sitemap.xml\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
