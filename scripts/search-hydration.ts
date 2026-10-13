import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

export default function searchHydration(): AstroIntegration {
  return {
    name: "techdata-search-hydration",
    hooks: {
      "astro:config:setup": ({ addClientDirective }) => {
        addClientDirective({
          name: "search",
          entrypoint: fileURLToPath(new URL("../src/client/search.ts", import.meta.url)),
        });
      },
    },
  };
}
