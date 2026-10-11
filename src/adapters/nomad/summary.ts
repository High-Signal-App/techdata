import { emptyFilters, facetCounts, rangeBounds } from "@saas-maker/ui/lib/filters";
import { median } from "./model.js";
import { costOf, DEFAULT_SORT, explorable, type Place, placeFilters, sortPlaces } from "./places";

/** First paint only; the unchanged source snapshot still powers queries and exports. */
export function placesSummary(cities: Place[]) {
  const places = explorable(cities);
  const defs = placeFilters("nomad");
  return {
    rows: sortPlaces(places, DEFAULT_SORT, "nomad").slice(0, 50),
    total: places.length,
    countries: new Set(places.map((p) => p.country)).size,
    costMedian: median(places.map((p) => costOf(p, "nomad"))),
    netMedian: median(places.map((p) => p.internet_mbps)),
    bounds: Object.fromEntries(defs.filter((d) => d.kind === "range").map((d) => [d.id, rangeBounds(places, d.value)])),
    facets: Object.fromEntries(
      defs.filter((d) => d.kind === "facet").map((d) => [d.id, facetCounts(places, defs, emptyFilters(), d.id)]),
    ),
  };
}
export type PlacesSummary = ReturnType<typeof placesSummary>;
