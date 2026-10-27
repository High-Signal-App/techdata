import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicBuildSnapshot } from "../src/lib/public-build-snapshot";
import { htmlDiscovery, publicPaths, publicReadability } from "../src/lib/public-readability";

const origin = "https://data.highsignal.app";
async function get(path: string, init: RequestInit = {}) {
  const response = await publicReadability(new Request(origin + path, init), origin);
  if (!response) throw Error("Expected public response");
  return response;
}
describe("public source-backed documents", () => {
  it("covers exactly public source pages and keeps local comparisons excluded", async () => {
    const expected = readdirSync(new URL("../src/pages/", import.meta.url), { recursive: true })
      .map(String)
      .filter((path) => path.endsWith(".astro") && !["compare.astro", "nomad/compare.astro"].includes(path))
      .map((path) => (path === "index.astro" ? "/" : `/${path.replace(/(?:\/index)?\.astro$/, "")}/`));
    expect([...publicPaths].sort()).toEqual(expected.sort());
    const registry = (await (await get("/api/md/_catalog")).json()) as { path: string }[];
    expect(registry.map((route: { path: string }) => route.path).sort()).toEqual(expected.sort());
    for (const path of ["/compare.md", "/nomad/compare.md", "/api/md/api/files/private", "/unknown.md"]) {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("serves matching static content through suffix, Accept and direct API with complete headers", async () => {
    for (const path of publicPaths.filter((path) => !path.startsWith("/reddit/"))) {
      const suffix = path === "/" ? "/index.md" : path.replace(/\/$/, "") + ".md";
      const response = await get(suffix),
        body = await response.text();
      expect(response.status).toBe(200);
      expect(body).toMatch(/^# /);
      expect(body).not.toMatch(/\]\(\//);
      expect(response.headers.get("x-markdown-tokens")).toBe(String(Math.ceil(body.length / 4)));
      expect(response.headers.get("content-location")).toBe(origin + path);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
      expect(
        await (
          await get(path + "?private=CANARY", {
            headers: { Accept: "text/markdown", Cookie: "CANARY", Authorization: "Bearer CANARY" },
          })
        ).text(),
      ).toBe(body);
      expect(await (await get("/api/md" + path)).text()).toBe(body);
      expect(await (await get(suffix, { method: "HEAD" })).text()).toBe("");
      expect((await get("/api/md" + path, { method: "OPTIONS" })).status).toBe(204);
    }
  });
  it("keeps visible source values and the exact captured version", async () => {
    const full = await (await get("/llms-full.txt")).text();
    expect(full.length).toBeLessThan(500000);
    expect(full).toContain("Included 11 of 13");
    expect(full).toContain(publicBuildSnapshot.capturedAt);
    expect(full).not.toContain("CANARY");
    const people = await (await get("/podcasts/people.md")).text();
    for (const person of publicBuildSnapshot.people?.data.people ?? []) expect(people).toContain(person.name);
    const home = await (await get("/index.md")).text();
    for (const row of publicBuildSnapshot.overview)
      expect(home).toContain("error" in row ? row.error : row.description);
  });
  it("negotiates by quality and preserves HTML variation", async () => {
    for (const accept of ["*/*", "text/markdown;q=0", "text/markdown;q=0.5,text/html;q=1", "text/markdown,text/html"])
      expect(await publicReadability(new Request(origin + "/", { headers: { accept } }))).toBeNull();
    const response = htmlDiscovery(
      new Response("<main>same body</main>", { headers: { "Content-Type": "text/html", Vary: "Origin" } }),
      "/",
      origin,
    );
    expect(await response.text()).toBe("<main>same body</main>");
    expect(response.headers.get("vary")).toBe("Origin, Accept");
    expect(response.headers.get("link")).toContain("/index.md");
    expect(await (await get("/ai.txt")).text()).toContain("training: allowed on public pages only");
  });
});
