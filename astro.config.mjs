import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Pages are prerendered; /api/*, robots.txt and sitemap.xml run in the Worker.
// Sessions and the Images binding are off so the adapter never asks Cloudflare
// to provision a KV namespace or an Images binding for this app.
export default defineConfig({
  output: "static",
  site: process.env.PUBLIC_SITE_URL || undefined,
  trailingSlash: "ignore",
  adapter: cloudflare({ imageService: "passthrough" }),
  session: false,
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
