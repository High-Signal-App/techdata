import { describe, expect, it } from "vitest";
import { nomadProvenance } from "../src/adapters/nomad/meta";
import { phProvenance } from "../src/adapters/ph/meta";
import type { Claim } from "../src/adapters/podcasts";
import { dedupePins, groupPins, MAX_PINS, pinFromColumns, pinKey, readPins, validatePin } from "../src/lib/compare";
import { pinClaim } from "../src/lib/podcast-pins";

const pin = pinFromColumns(
  "/nomad/",
  "rome-italy",
  "Rome",
  { cost: 1200, safety: null, visa: false },
  [
    { id: "cost", header: "cost", value: (r) => r.cost },
    { id: "safety", header: "safety", value: (r) => r.safety },
    { id: "visa", header: "visa", value: (r) => r.visa },
  ],
  nomadProvenance,
  "place",
);
if (!pin) throw new Error("pin validation failed");

describe("compare pins", () => {
  it("keeps only existing facts and their source, dates, revision and exact record URL", () => {
    expect(pin.fields).toEqual([
      { label: "cost", value: 1200 },
      { label: "visa", value: false },
    ]);
    expect(pin.provenance).toEqual(nomadProvenance);
    expect(pin.href).toBe("/nomad/?place=rome-italy");
    const ph = pinFromColumns("/ph/", "a product", "product", {}, [], phProvenance("2026-10-10T12:00:00Z"), "product");
    expect(ph?.provenance.collectedAt).toBeNull();
    expect(ph?.provenance.fetchedAt).toBe("2026-10-10T12:00:00Z");
    expect(ph?.href).toBe("/ph/?product=a+product");
  });
  it("deduplicates by collection and revision, bounds storage, and groups without field mapping", () => {
    const newer = { ...pin, title: "updated" };
    expect(dedupePins([pin, newer])).toEqual([newer]);
    const revision = { ...pin, id: "another-revision" };
    expect(pinKey(pin)).not.toBe(pinKey(revision));
    const other = { ...pin, group: "/ph/" as const, href: "/ph/?product=rome-italy" };
    expect(groupPins([pin, revision, other]).map((g) => [g.group, g.items.length])).toEqual([
      ["/nomad/", 2],
      ["/ph/", 1],
    ]);
    expect(dedupePins(Array.from({ length: 50 }, (_, i) => ({ ...pin, id: `${i}` })))).toHaveLength(MAX_PINS);
  });
  it("rejects malformed storage, executable/external URLs, missing dates and invalid facts", () => {
    for (const href of [
      "javascript:alert(1)",
      "//evil.example/",
      "/nomad/../ph/",
      "/nomad/\\evil",
      "https://evil.example/nomad/",
    ]) {
      expect(validatePin({ ...pin, href })).toBeNull();
    }
    expect(validatePin({ ...pin, provenance: { ...nomadProvenance, collectedAt: null } })).toBeNull();
    expect(validatePin({ ...pin, provenance: { ...nomadProvenance, sourceUrl: "javascript:alert(1)" } })).toBeNull();
    expect(validatePin({ ...pin, fields: [{ label: "cost", value: { fake: true } }] })).toBeNull();
    expect(validatePin({ ...pin, fields: [{ label: "cost", value: Number.NaN }] })).toBeNull();
    for (const raw of [null, "{", "{}", "42"]) expect(readPins(raw)).toEqual([]);
    expect(readPins(JSON.stringify([{}, pin]))).toEqual([pin]);
  });
  it("never stores an unverified claim speaker's name", () => {
    const claim = {
      id: "c",
      assertion: "assertion",
      quote: "quote",
      attributionStatus: "speaker_unverified",
      personName: "must not appear",
      claimType: "prediction",
      showName: "show",
      episodeTitle: "episode",
      saidOn: null,
      timestampS: null,
      sourceUrl: null,
    } as Claim;
    const unverified = pinClaim(claim, nomadProvenance);
    if (!unverified) throw new Error("claim validation failed");
    expect(JSON.stringify(unverified)).not.toContain("must not appear");
    expect(unverified.fields.find((f) => f.label === "speaker")?.value).toBe("unverified speaker");
    expect(
      pinClaim({ ...claim, attributionStatus: "verified_speaker" }, nomadProvenance)?.fields.find(
        (f) => f.label === "speaker",
      )?.value,
    ).toBe("must not appear");
  });
});
