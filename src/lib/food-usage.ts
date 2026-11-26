import { useEffect, useMemo } from "react";
import { shouldCollectBrowserAnalytics } from "./app-health-config";

type FoodUsageEvent =
  | "food.products_search_succeeded"
  | "food.product_lookup_succeeded"
  | "food.recipes_search_succeeded"
  | "food.recipe_lookup_succeeded";

export function trackFoodUsage(event: FoodUsageEvent) {
  if (typeof window === "undefined" || !shouldCollectBrowserAnalytics(new URL(window.location.href))) return;
  const { appHealth } = window as Window & { appHealth?: { track(name: FoodUsageEvent): void } };
  try {
    appHealth?.track(event);
  } catch {
    // Optional analytics must never interfere with the user's action.
  }
}

export function createFoodUsageRequest(event: FoodUsageEvent) {
  let pending: string | null = null;
  return {
    expect(request: string | null) {
      pending = request;
    },
    complete(request: string) {
      if (request !== pending) return;
      pending = null;
      trackFoodUsage(event);
    },
  };
}

export function useFoodUsageRequest(event: FoodUsageEvent) {
  const usage = useMemo(() => createFoodUsageRequest(event), [event]);
  useEffect(() => {
    const cancel = () => usage.expect(null);
    window.addEventListener("popstate", cancel);
    return () => {
      cancel();
      window.removeEventListener("popstate", cancel);
    };
  }, [usage]);
  return usage;
}
