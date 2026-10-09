import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOMAD_SNAPSHOT } from "../src/adapters/nomad/meta";
import { type AtlasFilters, selectCities } from "../src/adapters/nomad/model.js";
import {
  type Dataset,
  explorable,
  fromAtlasQuery,
  isAtlasQuery,
  type Place,
  PRESETS,
  queryPlaces,
  readPlacesQuery,
  unusualCost,
} from "../src/adapters/nomad/places";
import { searchPlaces } from "../src/lib/nomad-search";

const raw = readFileSync(new URL("../public/data/nomad/cities.json", import.meta.url));
const { cities } = JSON.parse(raw.toString()) as Dataset;
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const sibling = new URL("../../nomad-data-adventure/", import.meta.url);

describe("snapshot identity", () => {
  it("is byte-identical to the published Nomad Atlas cities.json", () => {
    expect(sha(raw)).toBe(NOMAD_SNAPSHOT.sha256);
    const source = new URL("cities.json", sibling);
    if (existsSync(source)) expect(sha(readFileSync(source))).toBe(NOMAD_SNAPSHOT.sha256);
  });

  it("keeps model.js unchanged from Nomad Atlas", () => {
    const ours = readFileSync(new URL("../src/adapters/nomad/model.js", import.meta.url));
    expect(sha(ours)).toBe("849e8c282008728d9284d9e8043da6b38718a7cbe8f4593381a2d53d8fb0ca31");
    const source = new URL("model.js", sibling);
    if (existsSync(source)) expect(sha(readFileSync(source))).toBe(sha(ours));
  });

  it("has the counts the views claim", () => {
    expect(cities.length).toBe(NOMAD_SNAPSHOT.records);
    expect(new Set(cities.map((c) => c.slug)).size).toBe(cities.length);
    const shown = explorable(cities);
    expect(shown.length).toBe(NOMAD_SNAPSHOT.explorable);
    expect(new Set(shown.map((c) => c.country)).size).toBe(NOMAD_SNAPSHOT.countries);
    expect(cities.filter((c) => c.region === "Space").length).toBe(9);
  });
});

/** Every Nomad Atlas filter, run through Atlas's own model and through techdata. */
const ATLAS_CASES: Partial<AtlasFilters>[] = [
  {},
  { budget: "1500" },
  { internet: "50" },
  { walkability: "4" },
  { visa: true },
  { region: "Europe", profile: "expat", budget: "3000", internet: "25", walkability: "4", sort: "cost" },
  { q: "sao paulo" },
  { q: "portugal" },
  { country: "Portugal", sort: "internet_mbps" },
  { profile: "family", budget: "2000", sort: "cost" },
  { profile: "local", budget: "800", safety: "3" },
  { air: "50", sort: "air_quality_now" },
  { tempMin: "20", tempMax: "30" },
  { healthcare: "4", english: "3", sort: "healthcare_score_0_to_5" },
  { lgbt: "4", female: "3", nightlife: "3", cleanliness: "3" },
  { visa: true, sort: "nightlife_score_0_to_5" },
  { region: "Asia", sort: "safety_score_0_to_5" },
  { sort: "walkability_score_0_to_5" },
  { budget: "15000" },
];

function atlasParams(f: Partial<AtlasFilters>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) p.set(k, String(v));
  return p;
}

describe("parity with Nomad Atlas filtering and sorting", () => {
  for (const f of ATLAS_CASES) {
    it(`matches ${JSON.stringify(f)}`, () => {
      const expected = selectCities(cities, f).map((c: Place) => c.slug);
      const ours = queryPlaces(cities, readPlacesQuery(fromAtlasQuery(atlasParams(f)))).map((c) => c.slug);
      expect(ours).toEqual(expected);
    });
  }

  it("quick filters match Atlas presets", () => {
    const atlas: Record<string, Partial<AtlasFilters>> = {
      budget: { budget: "1500" },
      connected: { internet: "50" },
      walkable: { walkability: "4" },
      visa: { visa: true },
    };
    for (const preset of PRESETS) {
      const ours = queryPlaces(cities, {
        filters: preset.apply(),
        profile: "nomad",
        sort: { id: "overall_score", desc: true },
      });
      expect(ours.map((c) => c.slug)).toEqual(selectCities(cities, atlas[preset.id]).map((c: Place) => c.slug));
    }
  });

  it("missing measurements fail only the filters that use them", () => {
    const withMissing = explorable(cities).filter((c) => c.healthcare_score_0_to_5 == null);
    expect(withMissing.length).toBeGreaterThan(0);
    const all = queryPlaces(cities, readPlacesQuery(new URLSearchParams()));
    expect(all.length).toBe(1374);
    const filtered = queryPlaces(cities, readPlacesQuery(new URLSearchParams("healthcare=0..")));
    expect(filtered.some((c) => c.healthcare_score_0_to_5 == null)).toBe(false);
  });
});

describe("Nomad Atlas share links", () => {
  it("are recognised and translated", () => {
    expect(isAtlasQuery(new URLSearchParams("budget=1500&internet=25"))).toBe(true);
    expect(isAtlasQuery(new URLSearchParams("visa=true"))).toBe(true);
    expect(isAtlasQuery(new URLSearchParams("sort=cost"))).toBe(false);
    expect(isAtlasQuery(new URLSearchParams("sort=internet_mbps"))).toBe(true);
    expect(isAtlasQuery(new URLSearchParams("internet=25..&cost=..1500"))).toBe(false);
    expect(
      fromAtlasQuery(new URLSearchParams("budget=1500&internet=25&tempMin=18&air=40&visa=true&view=cards")).toString(),
    ).toBe("cost=..1500&internet=25..&temp=18..&aqi=..40&visa=reported&view=cards");
  });
});

describe("flags and search", () => {
  it("flags unusual cost estimates without changing them", () => {
    expect(unusualCost(99)).toBe(true);
    expect(unusualCost(30001)).toBe(true);
    expect(unusualCost(1500)).toBe(false);
    expect(unusualCost(null)).toBe(false);
  });

  it("finds places accent-insensitively, names first", () => {
    const hits = searchPlaces(explorable(cities), "sao paulo");
    expect(hits[0]?.title).toBe("São Paulo");
    expect(hits[0]?.href).toBe("/nomad/?place=sao-paulo-brazil");
    expect(searchPlaces(explorable(cities), "portugal").some((h) => h.kind === "countries")).toBe(true);
  });
});
