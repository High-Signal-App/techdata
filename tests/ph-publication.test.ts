import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createPublicationReader,
  type PublishedProduct,
  phPublication,
  productShard,
  safeWebUrl,
} from "../src/lib/ph-publication";

const root = new URL("../public/", import.meta.url);
const read = async (path: string) => new Response(await readFile(new URL(`.${path}`, root)));

describe("PH publication admission and crawl graph", () => {
  it("publishes exactly the admitted source records with matching catalog links and sitemaps", async () => {
    const products: PublishedProduct[] = (
      await Promise.all(
        Array.from(
          { length: 256 },
          async (_, n) =>
            JSON.parse(
              await readFile(
                new URL(`data/ph/publication/products/${n.toString(16).padStart(2, "0")}.json`, root),
                "utf8",
              ),
            ) as PublishedProduct[],
        ),
      )
    ).flat();
    expect(products.length).toBe(phPublication.products);
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    const invalid = products.filter(
      (p) =>
        !p.name ||
        !p.categories.length ||
        (p.description?.length ?? 0) < 160 ||
        (p.description?.split(/\s+/).length ?? 0) < 25 ||
        !/^(www\.)?producthunt\.com$/.test(new URL(p.producthunt_url ?? "").hostname) ||
        !/^[a-z0-9][a-z0-9-]*$/.test(p.slug) ||
        p.catalogPage < 1 ||
        p.catalogPage > phPublication.catalogPages ||
        p.related.some(
          (other) =>
            other.slug === p.slug ||
            !p.categories.includes(other.category) ||
            !bySlug.get(other.slug)?.categories.includes(other.category),
        ),
    );
    expect(invalid.map((p) => p.slug)).toEqual([]);
    const reader = createPublicationReader(read);
    const catalog = (
      await Promise.all(Array.from({ length: phPublication.catalogPages }, (_, n) => reader.catalog(String(n + 1))))
    ).flat();
    expect(catalog.map((p) => p?.slug).sort()).toEqual(products.map((p) => p.slug).sort());
    const chunks = await Promise.all(phPublication.sitemapChunks.map((chunk) => reader.sitemap(chunk)));
    expect(chunks.every((chunk) => chunk && chunk.length <= 5000)).toBe(true);
    const paths = chunks.flat() as string[];
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.filter((path) => path.startsWith("/ph/products/")).sort()).toEqual(
      products.map((p) => `/ph/products/${p.slug}/`).sort(),
    );
    expect(paths.filter((path) => path.startsWith("/ph/catalog/")).length).toBe(phPublication.catalogPages);
  });

  it("resolves existing identity and fails closed for unknown/invalid pages", async () => {
    const reader = createPublicationReader(read);
    const first = (await reader.catalog("1"))?.[0];
    expect(first).toBeDefined();
    const product = await reader.product(first?.slug ?? "");
    expect(product?.name).toBe(first?.name);
    expect(product?.description?.length).toBeGreaterThanOrEqual(160);
    expect(await reader.product("not-a-real-product-zzzz-test")).toBeNull();
    for (const path of ["0", "-1", "01", "1.2", "Infinity", String(phPublication.catalogPages + 1)])
      expect(await reader.catalog(path)).toBeNull();
    expect(await reader.product("../secret")).toBeNull();
    expect(await reader.sitemap("../../secret")).toBeNull();
    expect(productShard(first?.slug ?? "")).toMatch(/^[0-9a-f]{2}$/);
  });

  it("coalesces reads and retries failures instead of publishing an empty successful page", async () => {
    let reads = 0;
    const reader = createPublicationReader(async () => {
      reads++;
      return reads === 1 ? new Response("failed", { status: 503 }) : Response.json([]);
    });
    await expect(reader.catalog("1")).rejects.toThrow("unavailable");
    expect(await reader.catalog("1")).toEqual([]);
    await Promise.all([reader.catalog("1"), reader.catalog("1")]);
    expect(reads).toBe(2);
    expect(safeWebUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeWebUrl("https://user:password@example.com")).toBeUndefined();
  });
});
