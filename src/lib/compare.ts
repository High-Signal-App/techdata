import type { DataColumn } from "@saas-maker/ui/components/data-table";
import type { Provenance } from "../adapters/types";
import { isViewPath, type ViewPath } from "./views";

export const PINS_KEY = "techdata:pins:v1";
export const MAX_PINS = 24;
/** A display snapshot, not a shared adapter record schema. Fields remain collection-specific. */
export type PinnedItem = {
  group: ViewPath;
  id: string;
  recordId: string;
  title: string;
  href: string;
  fields: { label: string; value: string | number | boolean }[];
  provenance: Provenance;
};

export function pinKey(item: Pick<PinnedItem, "group" | "id">): string {
  return JSON.stringify([item.group, item.id]);
}
export function safeSourceUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
function text(value: unknown, max = 16000): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
function date(value: unknown): value is string {
  return text(value, 80) && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && Number.isFinite(Date.parse(value));
}
export function validatePin(value: unknown): PinnedItem | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (!isViewPath(p.group) || !text(p.id) || !text(p.recordId) || !text(p.title) || !text(p.href)) return null;
  // Persisted links must stay within the pinned collection, including decoded-path attacks.
  try {
    const url = new URL(p.href, "https://techdata.invalid");
    if (!p.href.startsWith(p.group) || url.origin !== "https://techdata.invalid" || url.pathname !== p.group)
      return null;
  } catch {
    return null;
  }
  if (!Array.isArray(p.fields) || p.fields.length > 100) return null;
  const fields: PinnedItem["fields"] = [];
  for (const f of p.fields) {
    if (
      !f ||
      typeof f !== "object" ||
      !text(f.label, 120) ||
      !(typeof f.value === "boolean" || text(f.value) || (typeof f.value === "number" && Number.isFinite(f.value)))
    )
      return null;
    fields.push({ label: f.label, value: f.value });
  }
  if (!p.provenance || typeof p.provenance !== "object") return null;
  const v = p.provenance as Record<string, unknown>;
  const localVia = typeof v.viaUrl === "string" && /^\/api\/files\/[a-zA-Z0-9/._-]+$/.test(v.viaUrl);
  if (
    !text(v.source, 500) ||
    !safeSourceUrl(v.sourceUrl) ||
    !text(v.via, 500) ||
    !(safeSourceUrl(v.viaUrl) || localVia) ||
    !(v.collectedAt === null || date(v.collectedAt)) ||
    (v.fetchedAt !== undefined && !date(v.fetchedAt)) ||
    (!v.collectedAt && !v.fetchedAt)
  )
    return null;
  for (const key of ["revision", "note"]) if (v[key] !== undefined && !text(v[key])) return null;
  return {
    group: p.group,
    id: p.id,
    recordId: p.recordId,
    title: p.title,
    href: p.href,
    fields,
    provenance: {
      source: v.source,
      sourceUrl: v.sourceUrl,
      via: v.via,
      viaUrl: v.viaUrl as string,
      collectedAt: v.collectedAt as string | null,
      fetchedAt: v.fetchedAt as string | undefined,
      revision: v.revision as string | undefined,
      note: v.note as string | undefined,
    },
  };
}
export function dedupePins(items: PinnedItem[]): PinnedItem[] {
  const unique = new Map<string, PinnedItem>();
  for (const item of items) unique.set(pinKey(item), item);
  return [...unique.values()].slice(0, MAX_PINS);
}
export function readPins(raw: string | null): PinnedItem[] {
  try {
    const data: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(data)) return [];
    return dedupePins(data.map(validatePin).filter((p): p is PinnedItem => !!p));
  } catch {
    return [];
  }
}
export function groupPins(items: PinnedItem[]) {
  const groups = new Map<ViewPath, PinnedItem[]>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups].map(([group, items]) => ({ group, items }));
}

/** Keep only actual, nonmissing values; no cross-collection field mapping. */
export function pinFromColumns<T>(
  group: ViewPath,
  recordId: string,
  title: string,
  row: T,
  columns: DataColumn<T>[],
  provenance: Provenance | undefined,
  param: string,
  extra: Record<string, string> = {},
  sourceUrl?: string,
): PinnedItem | null {
  if (!provenance) return null;
  const query = new URLSearchParams({ ...extra, [param]: recordId });
  return validatePin({
    group,
    recordId,
    id: JSON.stringify([recordId, provenance.revision ?? ""]),
    title,
    href: `${group}?${query}`,
    provenance: { ...provenance, sourceUrl: sourceUrl ?? provenance.sourceUrl },
    fields: columns.flatMap((c) => {
      const value = c.value(row);
      return value == null || value === "" ? [] : [{ label: c.header.toLowerCase(), value }];
    }),
  });
}
