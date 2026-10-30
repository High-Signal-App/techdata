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
  // Deliver the Console styles with the document instead of delaying first paint
  // behind another round trip on mobile connections.
  build: { inlineStylesheets: "always" },
  adapter: cloudflare({ imageService: "passthrough" }),
  session: false,
  integrations: [react(), searchHydration()],
  vite: { plugins: [tailwindcss()] },
});
