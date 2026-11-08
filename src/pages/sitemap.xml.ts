import type { APIRoute } from "astro";
import { sitemapChunks, sitemapResponse } from "../lib/publication-sitemaps";

export const prerender = false;
export const GET: APIRoute = ({ request, site }) =>
  sitemapResponse(
    sitemapChunks.map((chunk) => `/sitemaps/${chunk}.xml`),
    site?.origin ?? new URL(request.url).origin,
    true,
  );
