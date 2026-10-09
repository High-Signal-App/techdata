import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import type { Dataset } from "@/adapters/nomad/places";
import { createApp, type Env } from "@/server/app";

export const prerender = false;

// The snapshot is bundled into the Worker so search and /api/nomad never
// depend on a second request. The browser reads the same file as a static asset.
const app = createApp({
  nomad: async () => (await import("../../../public/data/nomad/cities.json")).default as unknown as Dataset,
});

export const ALL: APIRoute = ({ request }) => app.fetch(request, env as Env);
