// Types for model.js, which is copied byte-for-byte from
// Significant-Hobbies/nomad-data-adventure@3ab6a63 so filtering, formatting
// and CSV behave exactly as on Nomad Atlas. Do not edit model.js here.

export type ProfileId = "nomad" | "expat" | "local" | "family";
export type MetricType = "score" | "money" | "speed" | "temperature" | "percent" | "number" | "boolean";

export const profiles: Record<ProfileId, string>;
export const metrics: [key: string, label: string, type: MetricType][];
export const defaults: AtlasFilters;
export function known(x: unknown): x is number;
export function costKey(profile: string): string;
export function fold(x: unknown): string;
export function format(value: unknown, type?: MetricType): string;
export function selectCities<T>(cities: T[], filters: Partial<AtlasFilters>): T[];
export function median(values: unknown[]): number | null;
export function toCSV(rows: Record<string, unknown>[]): string;

export type AtlasFilters = {
  q: string;
  region: string;
  country: string;
  profile: string;
  budget: string;
  internet: string;
  safety: string;
  walkability: string;
  healthcare: string;
  english: string;
  female: string;
  lgbt: string;
  nightlife: string;
  cleanliness: string;
  tempMin: string;
  tempMax: string;
  air: string;
  visa: boolean;
  sort: string;
  view: string;
};
