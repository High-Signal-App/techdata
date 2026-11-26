import { afterEach, describe, expect, it, vi } from "vitest";
import { createFoodUsageRequest, trackFoodUsage } from "../src/lib/food-usage";

function browser(href = "https://data.highsignal.app/food/products/") {
  const track = vi.fn();
  vi.stubGlobal("window", { location: { href }, appHealth: { track } });
  return track;
}

afterEach(() => vi.unstubAllGlobals());

describe("Food usage", () => {
  it("records only matching deliberate successes once and sends the fixed name alone", () => {
    const track = browser();
    const usage = createFoodUsageRequest("food.products_search_succeeded");
    const older = "/api/food/products?q=private-old-query";
    const latest = "/api/food/products?q=private-new-query";
    usage.complete("/api/food/products");
    usage.expect(older);
    usage.expect(latest);
    usage.complete(older);
    expect(track).not.toHaveBeenCalled();
    usage.complete(latest);
    usage.complete(latest);
    expect(track.mock.calls).toEqual([["food.products_search_succeeded"]]);
  });

  it("cancels a pending action when it is superseded", () => {
    const track = browser();
    const usage = createFoodUsageRequest("food.product_lookup_succeeded");
    const lookup = "/api/food/products/private-product-id";
    usage.expect(lookup);
    usage.expect(null);
    usage.complete(lookup);
    expect(track).not.toHaveBeenCalled();
  });

  it.each([
    "https://data.highsignal.app/food/recipes/?fleet_qa=1",
    "https://preview.highsignal.app/food/recipes/",
    "http://localhost:4321/food/recipes/",
  ])("excludes synthetic and preview visits on %s", (href) => {
    const track = browser(href);
    trackFoodUsage("food.recipe_lookup_succeeded");
    expect(track).not.toHaveBeenCalled();
  });

  it("keeps Food usable when an optional tracker throws", () => {
    const track = browser();
    track.mockImplementation(() => {
      throw new Error("tracker unavailable");
    });
    expect(() => trackFoodUsage("food.recipes_search_succeeded")).not.toThrow();
  });
});
