import type { Provenance } from "../types";

export const PH_META = {
  label: "PH Catalog",
  sampleLabel: "sample: 2,000 of 574,752 products",
  sampleCount: 2000,
  fullCount: 574752,
  fullWithCategories: 93184,
  release: "Catalogue handoff v1",
  revision: "catalog-handoff-v1",
  publishedAt: "2026-08-31",
  sampledAt: "2026-10-09",
  releaseUrl: "https://github.com/Significant-Hobbies/ph-catalog/releases/tag/catalog-handoff-v1",
  collector: "ph-catalog",
  attribution: "Product Hunt (public product pages), catalogue by ph-catalog",
} as const;

export const PH_DATA_URL = import.meta.env.PUBLIC_PH_PARQUET_URL || "/data/ph/sample.parquet";

export function phProvenance(fetchedAt?: string): Provenance {
  return {
    source: "Product Hunt",
    sourceUrl: "https://www.producthunt.com/",
    via: "ph-catalog Parquet · DuckDB-WASM",
    viaUrl: PH_DATA_URL,
    collectedAt: null,
    fetchedAt,
    revision: PH_META.revision,
    note: `${PH_META.sampleLabel}. ${PH_META.release}, published ${PH_META.publishedAt}. Daily crawl of public sitemaps/pages; per-record collection dates not recorded. ${PH_META.attribution}.`,
  };
}
