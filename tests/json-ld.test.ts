import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "../src/lib/json-ld";
import hostile from "./fixtures/json-ld-hostile.json";

describe("JSON-LD HTML script boundary", () => {
  it.each(hostile)("keeps $id title and description inside one inert script element", (fixture) => {
    for (const [name, description] of [
      [fixture.rawTitle, fixture.rawDescription],
      [fixture.preparedTitle, fixture.preparedDescription],
    ]) {
      const data = { "@context": "https://schema.org", "@type": "WebPage", name, description };
      const serialized = serializeJsonLd(data);
      expect(serialized).not.toContain("<");
      expect(serialized).not.toMatch(/<\/script/i);
      expect(JSON.parse(serialized)).toEqual(data);
    }
  });

  it("preserves normal text, quotes, ampersands and comparison signs in parsed JSON", () => {
    const data = {
      name: 'Research & tools "2026"',
      description: "Price < $20; score > 4. Apostrophe: it's fine.\n新しい製品",
    };
    const serialized = serializeJsonLd(data);
    expect(serialized).toContain("\\u003c");
    expect(JSON.parse(serialized)).toEqual(data);
  });
});
