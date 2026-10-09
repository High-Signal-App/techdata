import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Pages are prerendered; only /api/* runs in the Worker (Hono, see src/server).
// Sessions and the Images binding are off so the adapter never asks Cloudflare
// to provision a KV namespace or an Images binding for this app.
export default defineConfig({
  output: "static",
  trailingSlash: "ignore",
  adapter: cloudflare({ imageService: "passthrough" }),
  session: false,
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
