import { createChunkSitemapHandler } from "../../lib/publication-sitemaps";
import { podcastPublication } from "../../server/podcast-publication";
import { publication } from "../../server/publication";

export const prerender = false;
export const GET = createChunkSitemapHandler({ ph: publication.sitemap, podcasts: podcastPublication.sitemap });
