import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import dataset from "../public/data/nomad/cities.json";
import { nomadSummary } from "../src/adapters/nomad/meta";
import { explorable, queryPlaces, readPlacesQuery } from "../src/adapters/nomad/places";
import { placesSummary } from "../src/adapters/nomad/summary";
import PlacesExplorer from "../src/components/nomad/PlacesExplorer";
import Overview from "../src/components/Overview";

describe("useful first paint", () => {
  it("renders real home counts and provenance without a client request", () => {
    const html = renderToStaticMarkup(createElement(Overview, { rows: [nomadSummary] }));
    expect(html).toContain("1,374");
    expect(html).toContain("Nomads.com");
    expect(html).toContain("7 Sept 2026");
    expect(html).not.toContain('data-slot="skeleton"');
  });

  it("includes both responsive layouts, real first-page rows and full snapshot statistics", () => {
    const initial = placesSummary(dataset.cities);
    expect(initial.rows.map((p) => p.slug)).toEqual(
      queryPlaces(dataset.cities, readPlacesQuery(new URLSearchParams()))
        .slice(0, 50)
        .map((p) => p.slug),
    );
    expect(initial.total).toBe(explorable(dataset.cities).length);
    expect(initial.countries).toBe(205);
    // Bounds must cover the full dataset, not just the display prefix.
    expect(initial.bounds.cost?.max).toBe(
      Math.max(...explorable(dataset.cities).map((p) => p.cost_for_nomad_usd_per_month ?? 0)),
    );
    const html = renderToStaticMarkup(createElement(PlacesExplorer, { initial }));
    expect(html).toContain("hidden sm:block");
    expect(html).toContain("sm:hidden");
    expect(html).toContain(initial.rows[0].name);
    expect(html).toContain("1,374");
    expect(html).toContain("median internet");
    expect(html).not.toContain('aria-busy="true"');
  });
});
