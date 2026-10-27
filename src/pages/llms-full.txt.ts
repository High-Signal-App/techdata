import type { APIRoute } from "astro";
import { publicReadability } from "../lib/public-readability";
export const prerender = false;
export const GET: APIRoute = async ({ request, site }) =>
  (await publicReadability(request, site?.origin ?? new URL(request.url).origin)) ??
  new Response(null, { status: 404 });
export const HEAD = GET;
export const OPTIONS = GET;
