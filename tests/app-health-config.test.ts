import { describe, expect, it } from "vitest";
import { shouldCollectBrowserAnalytics } from "../src/lib/app-health-config";

describe("App Health browser analytics collection", () => {
  it("runs only on the canonical public origin and skips fleet QA traffic", () => {
    expect(shouldCollectBrowserAnalytics(new URL("https://data.highsignal.app/nomad"))).toBe(true);
    expect(shouldCollectBrowserAnalytics(new URL("https://data.highsignal.app/nomad?fleet_qa=1"))).toBe(false);
    expect(shouldCollectBrowserAnalytics(new URL("https://preview.highsignal.app/nomad"))).toBe(false);
    expect(shouldCollectBrowserAnalytics(new URL("http://localhost:4321/nomad"))).toBe(false);
  });
});
