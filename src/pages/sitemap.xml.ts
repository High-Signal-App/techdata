import type { APIRoute } from "astro";
import { sitemapChunks, sitemapResponse } from "../lib/publication-sitemaps";

export const prerender = false;
export const GET: APIRoute = () =>
  sitemapResponse(
    sitemapChunks.map((chunk) => `/sitemaps/${chunk}.xml`),
    true,
  );
