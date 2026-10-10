export const VIEWS_KEY = "techdata:views:v1";
export const MAX_VIEWS = 50;
export const VIEW_PATHS = [
  "/nomad/",
  "/ph/",
  "/papers/",
  "/papers/paths/",
  "/papers/cited/",
  "/papers/authors/",
  "/reddit/",
  "/reddit/posts/",
  "/podcasts/",
  "/podcasts/claims/",
  "/podcasts/people/",
] as const;
export type ViewPath = (typeof VIEW_PATHS)[number];
export type SavedView = { name: string; collection: ViewPath; query: string };

export function isViewPath(value: unknown): value is ViewPath {
  return typeof value === "string" && VIEW_PATHS.some((p) => p === value);
}

/** Canonical query order makes identical views deduplicate regardless of parameter order. */
export function serializeQuery(query: string): string {
  const params = new URLSearchParams(query);
  params.sort();
  return params.toString();
}

export function viewUrl(view: Pick<SavedView, "collection" | "query">): string {
  const query = serializeQuery(view.query);
  return view.collection + (query ? `?${query}` : "");
}

export function validateView(value: unknown): SavedView | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    !isViewPath(v.collection) ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 80 ||
    typeof v.query !== "string" ||
    v.query.length > 16000
  )
    return null;
  return { name: v.name.trim(), collection: v.collection, query: serializeQuery(v.query) };
}

export function dedupeViews(views: SavedView[]): SavedView[] {
  const byUrl = new Map<string, SavedView>();
  for (const view of views) byUrl.set(viewUrl(view), view);
  return [...byUrl.values()].slice(0, MAX_VIEWS);
}

export function readViews(raw: string | null): SavedView[] {
  try {
    const data: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(data)) return [];
    return dedupeViews(data.map(validateView).filter((v): v is SavedView => !!v));
  } catch {
    return [];
  }
}
