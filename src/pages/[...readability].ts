import type { APIRoute } from "astro";
import { publicReadability } from "../lib/public-readability";
export const prerender = false;
export const GET: APIRoute = async ({ request, site }) =>
  (await publicReadability(request, site?.origin ?? new URL(request.url).origin)) ??
  new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
export const HEAD = GET;
export const OPTIONS = GET;
