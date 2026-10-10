import type { Provenance } from "../types";

export const PH_META = {
  label: "PH Catalog",
  coverageLabel: "575,479 products · 93,897 with categories",
  fullCount: 575479,
  fullWithCategories: 93897,
  release: "ph-catalog catalog-state",
  revision: "catalog-state-2026-10-10",
  publishedAt: "2026-10-10",
  exportedAt: "2026-10-10",
  releaseUrl: "https://github.com/Significant-Hobbies/ph-catalog/releases/tag/catalog-state",
  collector: "ph-catalog",
  attribution: "Product Hunt (public product pages), catalogue by ph-catalog",
} as const;

export const PH_DATA_URL = "/api/files/ph/producthunt-full.parquet";

export function phProvenance(fetchedAt?: string): Provenance {
  return {
    source: "Product Hunt",
    sourceUrl: "https://www.producthunt.com/",
    via: "ph-catalog Parquet · DuckDB-WASM",
    viaUrl: PH_DATA_URL,
    collectedAt: null,
    fetchedAt,
    revision: PH_META.revision,
    note: `${PH_META.coverageLabel}. ${PH_META.release}, published ${PH_META.publishedAt}, exported ${PH_META.exportedAt}. Daily crawl of public sitemaps/pages; per-record collection dates not recorded. ${PH_META.attribution}.`,
  };
}
