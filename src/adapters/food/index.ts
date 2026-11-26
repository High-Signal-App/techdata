import type { CollectionSummary, Provenance, SearchHit } from "../types";

export const FOOD_SITE = "https://food.significanthobbies.com";
export const FOOD_API_BASE = `${FOOD_SITE}/api`;
export const FOOD_CATEGORIES = [
  "protein_powder",
  "protein_bar",
  "protein_snack",
  "soy_product",
  "dairy",
  "plant_dairy",
  "ready_to_drink",
  "breakfast",
  "spread",
  "other",
] as const;

export type FoodNutrition = {
  calories: number | null;
  proteinGrams: number | null;
  carbohydrateGrams: number | null;
  sugarGrams: number | null;
  fatGrams: number | null;
  saturatedFatGrams: number | null;
  fibreGrams: number | null;
  sodiumMg: number | null;
  observedAt: string | null;
  labelVerifiedAt: string | null;
  basis: string | null;
};

export type FoodProduct = {
  id: string;
  gtin: string | null;
  imageUrl: string | null;
  brand: string | null;
  name: string;
  flavour: string | null;
  category: string | null;
  netQuantityGrams: number | null;
  servingSizeGrams: number | null;
  nutritionStatus: string | null;
  nutritionEvidenceAuthority: string | null;
  nutritionEvidenceUrl: string | null;
  ingredientStatus: string | null;
  completeness: number | null;
  nutrition: FoodNutrition | null;
};

export type FoodProductPage = {
  products: FoodProduct[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
  trustedDefault?: boolean;
  filters?: Record<string, string | number | boolean>;
};

export type FoodRecipe = {
  id: string;
  title: string;
  publisher: string | null;
  url: string | null;
  sourceType: string | null;
  format: string | null;
  indiaFit: string | null;
  indiaFitNote: string | null;
  dietary: string | null;
  proteinSources: string[];
  ingredients: string[];
  nutrition: {
    protein: number | null;
    calories: number | null;
    proteinQualifier?: string;
    calorieQualifier?: string;
    servingBasis: string | null;
    sourceNote: string | null;
  } | null;
};

export type FoodRecipePage = {
  recipes: FoodRecipe[];
  total?: number;
  collectionTotal?: number;
  collectedAt?: string | null;
  nutritionAuthority?: string;
  nutritionBasis?: string;
};
export type FoodEnvelope<T> = { data: T; provenance: Provenance };

export class FoodUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`Food API ${status} for ${url}`);
  }
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const boundedText = (value: string | null | undefined, max: number) => value?.trim().slice(0, max) || undefined;
const int = (value: string | null | undefined, fallback: number, min: number, max: number) => {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
export function publicFoodUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

const safeProduct = (product: FoodProduct): FoodProduct => ({
  ...product,
  nutritionEvidenceUrl: publicFoodUrl(product.nutritionEvidenceUrl),
});

export function foodProvenance(apiUrl: string, fetchedAt: string): Provenance {
  return {
    source: "Significant Hobbies Food",
    sourceUrl: FOOD_SITE,
    via: "public read-only API",
    viaUrl: apiUrl,
    collectedAt: null,
    fetchedAt,
    note: "Nutrition and ingredients retain the source's verification status, observation date and measurement basis. Missing values are unknown. The Food catalog publication date is not a collection date.",
  };
}

export function createFoodAdapter(opts: { base?: string; fetch?: Fetcher; now?: () => Date } = {}) {
  const base = (opts.base ?? FOOD_API_BASE).replace(/\/$/, "");
  const doFetch = opts.fetch ?? ((url, init) => fetch(url, init));
  const now = opts.now ?? (() => new Date());

  async function get<T>(path: string, params: Record<string, string | number | undefined> = {}) {
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(params))
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    const signal = AbortSignal.timeout(8000);
    const apiUrl = url.toString();
    try {
      const response = await doFetch(apiUrl, { headers: { accept: "application/json" }, signal });
      if (!response.ok) throw new FoodUpstreamError(response.status, apiUrl);
      return { data: (await response.json()) as T, provenance: foodProvenance(apiUrl, now().toISOString()) };
    } catch (error) {
      if (error instanceof FoodUpstreamError) throw error;
      throw new FoodUpstreamError(signal.aborted ? 504 : 502, apiUrl);
    }
  }

  const products = async (q: URLSearchParams) => {
    const query = q.get("q")?.trim();
    if (query && query.length > 200) throw new FoodUpstreamError(400, `${base}/products`);
    const result = await get<FoodProductPage>("/products", {
      q: query,
      category: boundedText(q.get("category"), 80),
      trust: boundedText(q.get("trust"), 80),
      marketed: boundedText(q.get("marketed"), 80),
      dense: boundedText(q.get("dense"), 80),
      verification: boundedText(q.get("verification"), 80),
      ingredientVerification: boundedText(q.get("ingredientVerification"), 80),
      scope: boundedText(q.get("scope"), 80),
      minCompleteness: int(q.get("minCompleteness"), 0, 0, 100),
      sort: boundedText(q.get("sort"), 80),
      order: boundedText(q.get("order"), 80),
      page: int(q.get("page"), 1, 1, 100_000),
      pageSize: int(q.get("pageSize"), 24, 1, 50),
    });
    if (!Array.isArray(result.data?.products) || !result.data.pagination) {
      throw new FoodUpstreamError(502, `${base}/products`);
    }
    return { ...result, data: { ...result.data, products: result.data.products.map(safeProduct) } };
  };

  const recipes = (q: URLSearchParams) => {
    return get<FoodRecipePage>("/recipes", {
      q: boundedText(q.get("q"), 120),
      dietary: boundedText(q.get("dietary"), 80),
    });
  };

  return {
    products,
    async recipes(q: URLSearchParams) {
      const result = await recipes(q);
      if (!Array.isArray(result.data?.recipes)) throw new FoodUpstreamError(502, `${base}/recipes`);
      return {
        ...result,
        data: {
          ...result.data,
          recipes: result.data.recipes.slice(0, 50).map((recipe) => ({ ...recipe, url: publicFoodUrl(recipe.url) })),
        },
        provenance: { ...result.provenance, collectedAt: result.data.collectedAt ?? null },
      };
    },

    async product(id: string) {
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new FoodUpstreamError(404, `${base}/products`);
      const result = await get<FoodProduct>(`/products/${id}`);
      if (result.data?.id !== id) throw new FoodUpstreamError(502, `${base}/products/${id}`);
      return { ...result, data: safeProduct(result.data) };
    },

    async summary(): Promise<CollectionSummary> {
      const { data, provenance } = await get<{
        products: number;
        latestPublishedAt: string | null;
        sourceComplete: boolean;
      }>("/health");
      return {
        id: "food",
        label: "Significant Hobbies Food",
        description: "Packaged food nutrition observations and source-linked vegetarian recipes.",
        counts: { products: data.products },
        provenance: data.latestPublishedAt
          ? { ...provenance, note: `${provenance.note} Latest catalog publication: ${data.latestPublishedAt}.` }
          : provenance,
        mode: "read-only",
      };
    },

    async search(query: string, limit = 5): Promise<SearchHit[]> {
      const params = new URLSearchParams({ q: query, page: "1", pageSize: String(Math.min(10, limit)) });
      const { data } = await products(params);
      return data.products.slice(0, limit).map((product) => ({
        collection: "food",
        kind: "products",
        id: product.id,
        title: product.name,
        subtitle: product.brand ?? undefined,
        meta: product.nutrition?.basis ? `nutrition ${product.nutrition.basis}` : undefined,
        href: `/food/products/?q=${encodeURIComponent(query)}&product=${encodeURIComponent(product.id)}`,
      }));
    },
  };
}

export type FoodAdapter = ReturnType<typeof createFoodAdapter>;
