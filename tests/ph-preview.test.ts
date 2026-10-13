import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import summary from "../public/data/ph/summary.json";
import { phPreview } from "../src/adapters/ph/summary";
import ProductsPreview from "../src/components/ph/ProductsPreview";

describe("PH first paint", () => {
  it("retains real prefix rows, counts and provenance without pretending missing facets are empty", () => {
    const preview = phPreview(summary);
    expect(preview.rows).toEqual(summary.rows.slice(0, 50));
    expect(preview.total).toBe(summary.total);
    expect(preview.withCategories).toBe(summary.withCategories);
    expect(preview.provenance).toEqual(summary.provenance);
    expect(preview).not.toHaveProperty("categories");
  });
  it("renders the declared real prefix in a fixed table and keeps incomplete controls disabled", () => {
    const html = renderToStaticMarkup(createElement(ProductsPreview, { preview: phPreview(summary) }));
    expect(html.match(/<tr\b[^>]*data-row=/g)).toHaveLength(20);
    expect(html).toContain("Showing initial products.");
    expect(html).toContain(summary.total.toLocaleString("en-US"));
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain('class="resource-table');
    expect(html).not.toContain("Full catalog ready.");
  });
});
