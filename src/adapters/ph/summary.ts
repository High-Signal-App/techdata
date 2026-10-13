import type { Provenance } from "../types";
import type { PhFilters, PhSort, Product } from "./query";

export type PhSummary = {
  version: number;
  sort: string;
  total: number;
  withCategories: number;
  rows: Product[];
  categories: { value: string; count: number }[];
  websites: { value: string; count: number }[];
  provenance: Provenance & { sha256: string; exportedAt: string; releaseUrl: string };
};

/** Real first-paint rows/counts; full facets and remaining rows load from the same checked-in file. */
export type PhPreview = Omit<PhSummary, "categories">;
export function phPreview(summary: PhSummary): PhPreview {
  const { categories: _categories, ...preview } = summary;
  return { ...preview, rows: summary.rows.slice(0, 20) };
}

/** Only complete unfiltered pages can be answered by this prefix of the export. */
export function summaryPage(summary: PhSummary | PhPreview, filters: PhFilters, sort: PhSort, page: number) {
  if (
    filters.q?.trim() ||
    filters.categories?.length ||
    filters.website?.length ||
    `${sort.id}:${sort.desc ? "desc" : "asc"}` !== summary.sort ||
    !Number.isInteger(page) ||
    page < 0 ||
    (page + 1) * 50 > summary.rows.length
  )
    return null;
  return summary.rows.slice(page * 50, (page + 1) * 50);
}

/** Wait for a paint opportunity before starting the expensive engine import. */
export function afterPhPaint(start: () => void) {
  let idle: number | undefined;
  let second: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(() => {
      if ("requestIdleCallback" in window) idle = window.requestIdleCallback(start, { timeout: 500 });
      else timer = setTimeout(start, 0);
    });
  });
  return () => {
    cancelAnimationFrame(first);
    if (second !== undefined) cancelAnimationFrame(second);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    if (timer !== undefined) clearTimeout(timer);
  };
}

/** Do not publish an obsolete query when URL state changes during a read. */
export function latestPhRead<T>(read: () => Promise<T>, publish: (value: T) => void, fail: (error: unknown) => void) {
  let current = true;
  void read()
    .then((value) => {
      if (current) publish(value);
    })
    .catch((error: unknown) => {
      if (current) fail(error);
    });
  return () => {
    current = false;
  };
}
