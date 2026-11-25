import type { CollectionSummary, Provenance, SearchHit } from "../types";

export const FOOD_SITE = "https://food.significanthobbies.com";
export const FOOD_API_BASE = `${FOOD_SITE}/api`;

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
  url: string;
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
const choices = (value: string | null, allowed: readonly string[]) =>
  value && allowed.includes(value) ? value : undefined;

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
    const response = await doFetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new FoodUpstreamError(response.status, url.toString());
    return { data: (await response.json()) as T, provenance: foodProvenance(url.toString(), now().toISOString()) };
  }

  const products = (q: URLSearchParams) =>
    get<FoodProductPage>("/products", {
      q: boundedText(q.get("q"), 120),
      category: choices(q.get("category"), ["all", "protein_powder", "protein_bar", "protein_drink", "snack", "food"]),
      trust: choices(q.get("trust"), ["all", "trusted"]),
      marketed: choices(q.get("marketed"), ["all", "protein"]),
      dense: choices(q.get("dense"), ["all", "yes"]),
      verification: choices(q.get("verification"), ["all", "verified", "unverified"]),
      ingredientVerification: choices(q.get("ingredientVerification"), ["all", "verified", "unverified"]),
      scope: choices(q.get("scope"), ["all", "india"]),
      minCompleteness: int(q.get("minCompleteness"), 0, 0, 100),
      sort: choices(q.get("sort"), ["protein_density", "protein", "calories", "completeness", "name"]),
      order: choices(q.get("order"), ["asc", "desc"]),
      page: int(q.get("page"), 1, 1, 100_000),
      pageSize: int(q.get("pageSize"), 24, 1, 50),
    });

  const recipes = (q: URLSearchParams) => {
    const dietary = choices(q.get("dietary"), ["all", "vegetarian", "vegan"]);
    return get<FoodRecipePage>("/recipes", {
      q: boundedText(q.get("q"), 120),
      dietary: dietary === "all" ? undefined : dietary,
    });
  };

  return {
    products,
    async recipes(q: URLSearchParams) {
      const result = await recipes(q);
      return {
        ...result,
        data: { ...result.data, recipes: result.data.recipes.slice(0, 50) },
        provenance: { ...result.provenance, collectedAt: result.data.collectedAt ?? null },
      };
    },

    product(id: string) {
      return get<FoodProduct>(`/products/${encodeURIComponent(id.slice(0, 120))}`);
    },

    async summary(): Promise<CollectionSummary> {
      const { data, provenance } = await get<{ products: number; latestPublishedAt: string; sourceComplete: boolean }>(
        "/health",
      );
      return {
        id: "food",
        label: "Significant Hobbies Food",
        description: "Packaged food nutrition observations and source-linked vegetarian recipes.",
        counts: { products: data.products },
        provenance: {
          ...provenance,
          note: `${provenance.note} Latest catalog publication: ${data.latestPublishedAt}.`,
        },
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
