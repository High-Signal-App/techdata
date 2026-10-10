import { describe, expect, it } from "vitest";
import { dedupeViews, readViews, serializeQuery, VIEW_PATHS, validateView, viewUrl } from "../src/lib/views";

describe("saved views", () => {
  it("preserves filters, sorting, visible columns and snapshot identity in a shareable URL", () => {
    const query =
      "q=agent+tools&f.label=Discussion&r.score=0..100&sort=score:desc&columns=title,score&subreddit=AI_Agents&date=2026-10-09&v=7b30b0b1e86f";
    const view = validateView({ collection: "/reddit/posts/", name: "  agent tools  ", query });
    expect(view?.name).toBe("agent tools");
    if (!view) throw new Error("view validation failed");
    const params = new URL(viewUrl(view), "https://techdata.example").searchParams;
    expect(Object.fromEntries(params)).toEqual(Object.fromEntries(new URLSearchParams(query)));
    expect(serializeQuery("b=2&a=1&a=3")).toBe("a=1&a=3&b=2");
  });
  it("validates every explorer and rejects corrupt, unsafe or oversized storage entries", () => {
    for (const collection of VIEW_PATHS) expect(validateView({ collection, name: "view", query: "" })).not.toBeNull();
    for (const collection of ["//evil.example/", "https://evil.example/", "/nomad/../admin/", "/compare/", null]) {
      expect(validateView({ collection, name: "view", query: "" })).toBeNull();
    }
    expect(validateView({ collection: "/nomad/", name: " ", query: "" })).toBeNull();
    expect(validateView({ collection: "/nomad/", name: "x", query: "x".repeat(16001) })).toBeNull();
    for (const raw of [null, "{", "{}", '"hello"']) expect(readViews(raw)).toEqual([]);
    expect(readViews(JSON.stringify([{}, { name: "valid", collection: "/nomad/", query: "" }]))).toHaveLength(1);
  });
  it("deduplicates identical query states, keeps the latest name, and bounds storage", () => {
    expect(
      dedupeViews([
        { name: "first", collection: "/nomad/", query: "sort=cost&q=rome" },
        { name: "renamed", collection: "/nomad/", query: "q=rome&sort=cost" },
        { name: "other", collection: "/ph/", query: "q=rome&sort=cost" },
      ]).map((v) => v.name),
    ).toEqual(["renamed", "other"]);
    expect(viewUrl({ collection: "/ph/", query: "" })).toBe("/ph/");
    expect(
      readViews(
        JSON.stringify(Array.from({ length: 70 }, (_, i) => ({ name: `${i}`, collection: "/ph/", query: `q=${i}` }))),
      ),
    ).toHaveLength(50);
  });
});
