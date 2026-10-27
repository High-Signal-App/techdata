import { handle } from "@astrojs/cloudflare/handler";
import { htmlDiscovery, publicReadability } from "./lib/public-readability";

// Negotiate before Astro short-circuits prerendered routes to ASSETS.
export default {
  async fetch(request: Request, env: Parameters<typeof handle>[1], context: Parameters<typeof handle>[2]) {
    const url = new URL(request.url);
    const origin = import.meta.env.SITE || url.origin;
    const bindings = env as { REDDIT_INSIGHTS_API_BASE?: string };
    const response = await publicReadability(request, origin, { redditBase: bindings.REDDIT_INSIGHTS_API_BASE });
    if (response) return response;
    return htmlDiscovery(await handle(request, env, context), url.pathname, origin);
  },
};
