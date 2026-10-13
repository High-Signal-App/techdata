import { readdirSync } from "node:fs";
import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { GET as markdown } from "../src/pages/index.md";
import { GET as index } from "../src/pages/llms.txt";
import { GET as full } from "../src/pages/llms-full.txt";

const context = {} as APIContext;
describe("descriptive agent routes", () => {
  it("links every existing workbench route without inventing a production origin", async () => {
    const response = await index(context);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const text = await response.text();
    const routes = readdirSync(new URL("../src/pages/", import.meta.url), { recursive: true })
      .map(String)
      .filter((path) => path.endsWith(".astro"))
      .map((path) => (path === "index.astro" ? "/" : `/${path.replace(/(?:\/index)?\.astro$/, "")}/`));
    for (const route of routes) expect(text).toContain(`](${route})`);
    expect(text).not.toMatch(/workers\.dev|techdata\.example|https?:\/\//);
  });
  it("keeps limitations and current citation support in the expanded Markdown", async () => {
    const response = await markdown(context);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const text = await response.text();
    expect(text).toBe(await (await full(context)).text());
    expect(text).toContain("OpenAlex citation view");
    expect(text).toContain("authors are omitted");
    expect(text).toContain("per-record collection dates are not recorded");
    expect(text).toContain("not live data availability or production acceptance");
  });
});
