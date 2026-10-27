import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = ({ request, site }) =>
  new Response(
    "# Keep in sync with ai.txt and llms.txt.\n" +
      ["*", "GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider"]
        .map(
          (bot) =>
            `User-agent: ${bot}\nAllow: /\nDisallow: /api/\nAllow: /api/md/\nAllow: /api/ai\nDisallow: /compare/\nDisallow: /nomad/compare/\n`,
        )
        .join("\n") +
      `\nSitemap: ${site?.origin ?? new URL(request.url).origin}/sitemap.xml\n`,
    {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    },
  );
