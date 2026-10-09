/**
 * Nomad Atlas places: record type, filters, sort and exports. Plain data
 * code shared by the browser view and the Worker API, so a view's query
 * string can be replayed against /api/nomad/places unchanged.
 *
 * Semantics follow Nomad Atlas's model.js (copied unchanged next to this
 * file): missing measurements fail only the filters that use them, cost
 * and air quality sort ascending, everything else descending, missing
 * values sort last and ties break by name.
 */
import type { ExportColumn } from "@saas-maker/ui/lib/export";
import { emptyFilters, type FilterDef, type FilterState, filterRows, readFilters } from "@saas-maker/ui/lib/filters";
import { costKey, known, type MetricType, metrics, type ProfileId, profiles } from "./model.js";

/** One record exactly as Nomad Atlas publishes it in cities.json. */
export type Place = {
  slug: string;
  name: string;
  country: string;
  region: string;
  url: string;
  overall_score: number | null;
  cost_for_nomad_usd_per_month: number | null;
  cost_for_expat_usd_per_month: number | null;
  cost_for_local_usd_per_month: number | null;
  cost_for_family_usd_per_month: number | null;
  rent_1br_center_usd_per_month: number | null;
  coworking_usd_per_month: number | null;
  internet_mbps: number | null;
  temperature_c_now: number | null;
  humidity_now: number | null;
  air_quality_now: number | null;
  safety_score_0_to_5: number | null;
  cleanliness_score_0_to_5: number | null;
  fun_score_0_to_5: number | null;
  nightlife_score_0_to_5: number | null;
  walkability_score_0_to_5: number | null;
  healthcare_score_0_to_5: number | null;
  english_speaking_score_0_to_5: number | null;
  lgbt_friendly_score_0_to_5: number | null;
  female_friendly_score_0_to_5: number | null;
  has_remote_work_visa: boolean | null;
  population: number | null;
};

export type Dataset = { count: number; cities: Place[] };

export const PROFILE_IDS = Object.keys(profiles) as ProfileId[];
export const isProfile = (p: unknown): p is ProfileId => typeof p === "string" && (PROFILE_IDS as string[]).includes(p);

/** Nomad Atlas hides the source's nine novelty "Space" entries; the original JSON keeps them. */
export const explorable = (cities: Place[]) => cities.filter((c) => c.region !== "Space");

export const costOf = (p: Place, profile: ProfileId) => p[costKey(profile) as keyof Place] as number | null;

/** Nomad Atlas flags (never rewrites) cost estimates outside $100–$30,000. */
export const unusualCost = (v: unknown) => known(v) && (v < 100 || v > 30000);

const num = (field: keyof Place) => (p: Place) => p[field] as number | null;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const out5 = (n: number) => n.toFixed(1);

export const visaLabel = (v: boolean | null) => (v === true ? "reported" : "not reported");

export const LIFESTYLE_FILTERS = [
  "walkability",
  "healthcare",
  "english",
  "female",
  "lgbt",
  "nightlife",
  "cleanliness",
] as const;
export const WEATHER_FILTERS = ["temp", "aqi"] as const;

/** Filters for one cost profile. The cost range always reads the selected profile's estimate. */
export function placeFilters(profile: ProfileId): FilterDef<Place>[] {
  return [
    { kind: "facet", id: "region", label: "region", value: (p) => p.region },
    { kind: "facet", id: "country", label: "country", value: (p) => p.country },
    {
      kind: "range",
      id: "cost",
      label: `${profiles[profile].toLowerCase()} cost`,
      value: (p) => costOf(p, profile),
      format: usd,
      step: 50,
    },
    {
      kind: "range",
      id: "internet",
      label: "internet",
      value: num("internet_mbps"),
      format: (n) => `${n} Mbps`,
      step: 1,
    },
    { kind: "range", id: "safety", label: "safety", value: num("safety_score_0_to_5"), format: out5, step: 0.1 },
    { kind: "facet", id: "visa", label: "remote work visa", value: (p) => visaLabel(p.has_remote_work_visa) },
    {
      kind: "range",
      id: "walkability",
      label: "walkability",
      value: num("walkability_score_0_to_5"),
      format: out5,
      step: 0.1,
    },
    {
      kind: "range",
      id: "healthcare",
      label: "healthcare",
      value: num("healthcare_score_0_to_5"),
      format: out5,
      step: 0.1,
    },
    {
      kind: "range",
      id: "english",
      label: "english speaking",
      value: num("english_speaking_score_0_to_5"),
      format: out5,
      step: 0.1,
    },
    {
      kind: "range",
      id: "female",
      label: "female friendliness",
      value: num("female_friendly_score_0_to_5"),
      format: out5,
      step: 0.1,
    },
    {
      kind: "range",
      id: "lgbt",
      label: "lgbtq+ friendliness",
      value: num("lgbt_friendly_score_0_to_5"),
      format: out5,
      step: 0.1,
    },
    {
      kind: "range",
      id: "nightlife",
      label: "nightlife",
      value: num("nightlife_score_0_to_5"),
      format: out5,
      step: 0.1,
    },
    {
      kind: "range",
      id: "cleanliness",
      label: "cleanliness",
      value: num("cleanliness_score_0_to_5"),
      format: out5,
      step: 0.1,
    },
    {
      kind: "range",
      id: "temp",
      label: "temperature at collection",
      value: num("temperature_c_now"),
      format: (n) => `${n}°C`,
      step: 1,
    },
    {
      kind: "range",
      id: "aqi",
      label: "air quality index at collection",
      value: num("air_quality_now"),
      format: (n) => `AQI ${n}`,
      step: 1,
    },
  ];
}

/** Nomad Atlas matches the query against "name country", accent-insensitive. */
export const placeSearchText = (p: Place) => `${p.name} ${p.country}`;

/* ── Sort ─────────────────────────────────────────────────────────────── */

export type SortKey =
  | "cost"
  | "overall_score"
  | "internet_mbps"
  | "safety_score_0_to_5"
  | "walkability_score_0_to_5"
  | "healthcare_score_0_to_5"
  | "nightlife_score_0_to_5"
  | "air_quality_now"
  | "name"
  | "country";
export type PlaceSort = { id: string; desc: boolean };

/** The eight orders Nomad Atlas offers, with its default direction for each. */
export const SORT_OPTIONS: { id: SortKey; label: string; desc: boolean }[] = [
  { id: "overall_score", label: "overall score", desc: true },
  { id: "cost", label: "lowest monthly cost", desc: false },
  { id: "internet_mbps", label: "fastest internet", desc: true },
  { id: "safety_score_0_to_5", label: "safety", desc: true },
  { id: "walkability_score_0_to_5", label: "walkability", desc: true },
  { id: "healthcare_score_0_to_5", label: "healthcare", desc: true },
  { id: "nightlife_score_0_to_5", label: "nightlife", desc: true },
  { id: "air_quality_now", label: "lowest snapshot AQI", desc: false },
];
export const DEFAULT_SORT: PlaceSort = { id: "overall_score", desc: true };

export function parseSort(raw: string | null | undefined): PlaceSort {
  if (!raw) return DEFAULT_SORT;
  const id = raw.replace(/^-/, "");
  if (!/^[a-z0-9_]+$/.test(id)) return DEFAULT_SORT;
  return { id, desc: raw.startsWith("-") };
}
export const writeSort = (s: PlaceSort) => `${s.desc ? "-" : ""}${s.id}`;

export function sortValue(p: Place, id: string, profile: ProfileId): unknown {
  if (id === "cost") return costOf(p, profile);
  return p[id as keyof Place];
}

/** Missing values last whatever the direction; ties by name (as model.js). */
export function sortPlaces(rows: Place[], sort: PlaceSort, profile: ProfileId): Place[] {
  const dir = sort.desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, sort.id, profile);
    const y = sortValue(b, sort.id, profile);
    const xm = x == null || (typeof x === "number" && !Number.isFinite(x));
    const ym = y == null || (typeof y === "number" && !Number.isFinite(y));
    if (xm || ym) return xm && ym ? a.name.localeCompare(b.name) : xm ? 1 : -1;
    const c =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), "en", { numeric: true });
    return c * dir || a.name.localeCompare(b.name);
  });
}

/* ── View state from a query string (shared by browser and API) ───────── */

export type PlacesQuery = {
  filters: FilterState;
  profile: ProfileId;
  sort: PlaceSort;
};

export function readPlacesQuery(params: URLSearchParams): PlacesQuery {
  const profile = isProfile(params.get("profile")) ? (params.get("profile") as ProfileId) : "nomad";
  return { profile, filters: readFilters(placeFilters(profile), params), sort: parseSort(params.get("sort")) };
}

export function queryPlaces(cities: Place[], q: PlacesQuery): Place[] {
  const rows = filterRows(explorable(cities), placeFilters(q.profile), q.filters, { search: placeSearchText });
  return sortPlaces(rows, q.sort, q.profile);
}

/* ── Nomad Atlas share links ──────────────────────────────────────────── */

const ATLAS_MIN: Record<string, string> = {
  internet: "internet",
  safety: "safety",
  walkability: "walkability",
  healthcare: "healthcare",
  english: "english",
  female: "female",
  lgbt: "lgbt",
  nightlife: "nightlife",
  cleanliness: "cleanliness",
};

/** True when a query string looks like a nomad.significanthobbies.com share link. */
export function isAtlasQuery(params: URLSearchParams): boolean {
  if (["budget", "tempMin", "tempMax", "air"].some((k) => params.has(k))) return true;
  if (params.get("visa") === "true") return true;
  if (Object.keys(ATLAS_MIN).some((k) => params.has(k) && !params.get(k)?.includes(".."))) return true;
  const sort = params.get("sort");
  return !!sort && !sort.startsWith("-") && SORT_OPTIONS.some((o) => o.id === sort && o.desc);
}

/**
 * Converts a Nomad Atlas share link into techdata's query string, so old
 * links keep working if the public site later redirects here.
 */
export function fromAtlasQuery(params: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  const get = (k: string) => params.get(k)?.trim() ?? "";
  const n = (k: string) => (get(k) !== "" && Number.isFinite(Number(get(k))) ? Number(get(k)) : undefined);
  if (get("q")) out.set("q", get("q"));
  if (get("region")) out.append("region", get("region"));
  if (get("country")) out.append("country", get("country"));
  if (isProfile(get("profile")) && get("profile") !== "nomad") out.set("profile", get("profile"));
  const budget = n("budget");
  if (budget !== undefined && budget < 15000) out.set("cost", `..${budget}`);
  for (const [atlas, id] of Object.entries(ATLAS_MIN)) {
    const v = n(atlas);
    if (v !== undefined) out.set(id, `${v}..`);
  }
  const tMin = n("tempMin");
  const tMax = n("tempMax");
  if (tMin !== undefined || tMax !== undefined) out.set("temp", `${tMin ?? ""}..${tMax ?? ""}`);
  const air = n("air");
  if (air !== undefined) out.set("aqi", `..${air}`);
  if (get("visa") === "true") out.append("visa", "reported");
  const sort = SORT_OPTIONS.find((o) => o.id === get("sort"));
  if (sort && sort.id !== DEFAULT_SORT.id) out.set("sort", writeSort(sort));
  if (get("view") === "cards") out.set("view", "cards");
  return out;
}

/** Quick filters from Nomad Atlas, as techdata filter state. */
export const PRESETS: { id: string; label: string; apply: () => FilterState }[] = [
  { id: "budget", label: "under $1,500", apply: () => ({ ...emptyFilters(), ranges: { cost: { max: 1500 } } }) },
  { id: "connected", label: "50+ Mbps", apply: () => ({ ...emptyFilters(), ranges: { internet: { min: 50 } } }) },
  { id: "walkable", label: "walkable 4+", apply: () => ({ ...emptyFilters(), ranges: { walkability: { min: 4 } } }) },
  { id: "visa", label: "remote work visa", apply: () => ({ ...emptyFilters(), facets: { visa: ["reported"] } }) },
];

/* ── Export: every source field, in source order ──────────────────────── */

export const PLACE_FIELDS: (keyof Place)[] = [
  "slug",
  "name",
  "country",
  "region",
  "url",
  "overall_score",
  "cost_for_nomad_usd_per_month",
  "cost_for_expat_usd_per_month",
  "cost_for_local_usd_per_month",
  "cost_for_family_usd_per_month",
  "rent_1br_center_usd_per_month",
  "coworking_usd_per_month",
  "internet_mbps",
  "temperature_c_now",
  "humidity_now",
  "air_quality_now",
  "safety_score_0_to_5",
  "cleanliness_score_0_to_5",
  "fun_score_0_to_5",
  "nightlife_score_0_to_5",
  "walkability_score_0_to_5",
  "healthcare_score_0_to_5",
  "english_speaking_score_0_to_5",
  "lgbt_friendly_score_0_to_5",
  "female_friendly_score_0_to_5",
  "has_remote_work_visa",
  "population",
];
export const exportColumns: ExportColumn<Place>[] = PLACE_FIELDS.map((k) => ({ id: k, value: (p: Place) => p[k] }));

/** The 22 comparison metrics, as Nomad Atlas lists them. */
export const COMPARE_METRICS = metrics as [keyof Place, string, MetricType][];

/** Only https://nomads.com/ links leave the app, as on Nomad Atlas. */
export function sourceUrl(p: Pick<Place, "url">): string {
  try {
    const u = new URL(p.url);
    return u.protocol === "https:" && u.hostname === "nomads.com" ? u.href : "https://nomads.com/";
  } catch {
    return "https://nomads.com/";
  }
}
