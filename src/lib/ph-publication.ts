import type { Product } from "../adapters/ph/query";
import manifest from "../generated/ph-publication.json";

export { manifest as phPublication };
export type PublishedProduct = Product & {
  descriptionExcerpt: boolean;
  catalogPage: number;
  related: { slug: string; name: string; category: string }[];
};
export type CatalogProduct = Pick<Product, "slug" | "name" | "tagline" | "categories">;
export type AssetReader = (path: string) => Promise<Response>;

export function productShard(slug: string) {
  let value = 2166136261;
  for (const char of new TextEncoder().encode(slug)) value = Math.imul(value ^ char, 16777619) >>> 0;
  return (value % 256).toString(16).padStart(2, "0");
}

// Bounded per-isolate cache: large corpora stay in static assets, outside the Worker bundle.
export function createPublicationReader(read: AssetReader) {
  const cache = new Map<string, Promise<unknown>>();
  async function load<T>(path: string): Promise<T> {
    let pending = cache.get(path);
    if (!pending) {
      pending = read(`/data/ph/publication/${path}.json`).then(async (response) => {
        if (!response.ok) throw new Error("Publication snapshot unavailable");
        return response.json();
      });
      cache.set(path, pending);
      if (cache.size > 8) cache.delete(cache.keys().next().value as string);
      pending.catch(() => cache.delete(path));
    }
    return pending as Promise<T>;
  }
  return {
    async product(slug: string) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
      const rows = await load<PublishedProduct[]>(`products/${productShard(slug)}`);
      return rows.find((row) => row.slug === slug) ?? null;
    },
    async catalog(raw: string) {
      const page = Number(raw);
      if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(page) || page > manifest.catalogPages) return null;
      return load<CatalogProduct[]>(`catalog/${page}`);
    },
    async sitemap(chunk: string) {
      if (!manifest.sitemapChunks.includes(chunk)) return null;
      return load<string[]>(`sitemaps/${chunk}`);
    },
  };
}

export function safeWebUrl(value: string | null) {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
