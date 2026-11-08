import type { APIRoute } from "astro";
import { baseSitemap, sitemapResponse } from "../../lib/publication-sitemaps";
import { podcastPublication } from "../../server/podcast-publication";
import { publication } from "../../server/publication";

export const prerender = false;
export const GET: APIRoute = async ({ params, request, site }) => {
  const origin = site?.origin ?? new URL(request.url).origin;
  if (params.chunk === "pages") return baseSitemap(origin);
  try {
    if (params.chunk === "podcasts") {
      const response = sitemapResponse(await podcastPublication.sitemap(), origin);
      response.headers.set("Cache-Control", "public, max-age=60");
      return response;
    }
    const paths = await publication.sitemap(params.chunk ?? "");
    return paths
      ? sitemapResponse(paths, origin)
      : new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });
  } catch {
    return new Response("Snapshot unavailable", {
      status: 503,
      headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" },
    });
  }
};
