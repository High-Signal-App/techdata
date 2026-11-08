import { env } from "cloudflare:workers";
import { createPublicationReader } from "../lib/ph-publication";

// ASSETS is the Astro Cloudflare adapter's existing static-asset binding.
// Calling it directly avoids an HTTP self-request or another Worker invocation.
export const publication = createPublicationReader((path) =>
  (env as unknown as { ASSETS: Fetcher }).ASSETS.fetch(new Request(`https://assets.invalid${path}`)),
);
