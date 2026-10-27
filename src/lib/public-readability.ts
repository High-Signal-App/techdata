import documents from "../generated/public-markdown.json";
import { absoluteMarkdownLinks } from "./agent-surfaces/format.mjs";
import { createAgentSurfaceHandler, discoveryLinkHeader } from "./agent-surfaces/handler.mjs";
import { markdownPathFor, markdownResponse } from "./agent-surfaces/http.mjs";
import { createAgentSurfaceManifest } from "./agent-surfaces/manifest.mjs";
import { type PublicPath, publicPageCopy } from "./public-page-copy";
import { redditMarkdown } from "./public-reddit-markdown";
export const publicPaths = Object.keys(publicPageCopy) as PublicPath[];
export const publicPath = (path: string) =>
  publicPaths.find((route) => route.replace(/\/$/, "") === path.replace(/\/$/, ""));
export const publicRoutes = (origin: string) =>
  publicPaths.map((path) => ({
    path,
    url: new URL(path, origin).href,
    md: new URL(markdownPathFor(path), origin).href,
    title: publicPageCopy[path].heading,
    description: publicPageCopy[path].description,
    full: !path.startsWith("/reddit/"),
  }));
export async function publicReadability(
  request: Request,
  origin = new URL(request.url).origin,
  options: { redditBase?: string } = {},
) {
  const routes = publicRoutes(origin);
  const manifest = createAgentSurfaceManifest({
    name: "techdata",
    url: origin,
    summary: "Public, read-only data workbench, with sources and collection/fetch dates.",
    trainingAllowed: true,
    excludedPaths: [
      "/compare/",
      "/nomad/compare/",
      "/api/",
      "local saved views, pins, selected record details and user filters",
    ],
    notes: [
      "Static documents use the same public build snapshot as the HTML initial data. Interactive pages can refresh sources.",
      "Reddit documents are fresh, uncached reads and are excluded from the static full export. Missing dates and unverified speakers are never invented.",
    ],
    sitemap: origin + "/sitemap.xml",
    surfaces: routes.map((route) => ({
      id: route.path,
      url: route.path,
      md: markdownPathFor(route.path),
      kind: "collection" as const,
    })),
    pages: {},
  });
  const handler = createAgentSurfaceHandler({
    manifest,
    listMarkdownRoutes: () => routes,
    loadMarkdown: async (path: string) => {
      const body = path.startsWith("/reddit/")
        ? await redditMarkdown(path, { base: options.redditBase })
        : (documents as Partial<Record<PublicPath, string>>)[path as PublicPath];
      // Reddit cells are untrusted plain text; its authored source URLs are already absolute.
      if (path.startsWith("/reddit/")) return body ?? null;
      return body == null ? null : absoluteMarkdownLinks(body, new URL(path, origin).href);
    },
  });
  let response: Response | null;
  try {
    response = await handler(request);
  } catch {
    const error = markdownResponse(
      "# Public source unavailable\n\nThe current public source could not be verified. Retry later.\n",
      request,
      { "Cache-Control": "no-store", "Retry-After": "60" },
    );
    response = new Response(error.body, { status: 503, headers: error.headers });
  }
  if (response && new URL(request.url).pathname.includes("reddit")) response.headers.set("Cache-Control", "no-store");
  return response;
}
export function htmlDiscovery(response: Response, path: string, origin: string) {
  if (!publicPath(path) || !response.ok || !response.headers.get("Content-Type")?.includes("text/html"))
    return response;
  const headers = new Headers(response.headers),
    vary = headers.get("Vary");
  if (vary !== "*" && !vary?.split(",").some((value) => value.trim().toLowerCase() === "accept"))
    headers.set("Vary", vary ? vary + ", Accept" : "Accept");
  headers.append(
    "Link",
    `<${new URL(markdownPathFor(path), origin).href}>; rel="alternate"; type="text/markdown", ${discoveryLinkHeader(origin)}`,
  );
  return new Response(response.body, { status: response.status, headers });
}
