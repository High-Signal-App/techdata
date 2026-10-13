import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import searchHydration from "./scripts/search-hydration.ts";

// Most pages are prerendered; Reddit threads and API/indexing routes run in the Worker.
// Sessions and the Images binding are off so the adapter never asks Cloudflare
// to provision a KV namespace or an Images binding for this app.
export default defineConfig({
  output: "static",
  site: process.env.PUBLIC_SITE_URL || undefined,
  trailingSlash: "ignore",
  adapter: cloudflare({ imageService: "passthrough" }),
  session: false,
  build: { inlineStylesheets: "always" },
  integrations: [react(), searchHydration()],
  vite: { plugins: [tailwindcss()] },
});
