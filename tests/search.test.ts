import { describe, expect, it } from "vitest";
import { fold, groupResults, mergeResults, rankResults, type SearchHit } from "../src/search";

// Algorithm inputs, not collection records; real adapter data stays in adapter fixtures.
const hit = (id: string, title = "Lisbon", collection = "nomad", subtitle?: string): SearchHit => ({
  id,
  title,
  collection,
  kind: "places",
  subtitle,
  href: `/nomad/?place=${id}`,
});

describe("shared search index", () => {
  it("reuses accent/case-insensitive folding", () => {
    expect(fold("SÃO PAULO")).toBe(fold("São Paulo"));
    expect(rankResults([hit("other", "Lisbon"), hit("sao", "São Paulo")], "sao")[0].id).toBe("sao");
  });

  it("ranks exact, prefix, word-prefix and substring titles above subtitles", () => {
    const rows = [
      hit("subtitle", "Elsewhere", "nomad", "Lisbon"),
      hit("substring", "Alisbon"),
      hit("word", "Visit Lisbon"),
      hit("prefix", "Lisbon visit"),
      hit("exact", "Lisbon"),
    ];
    expect(rankResults(rows, "LISBON").map((h) => h.id)).toEqual(["exact", "prefix", "word", "substring", "subtitle"]);
    expect(
      rankResults(
        [
          hit("substring", "Elsewhere", "nomad", "Alisbon"),
          hit("word", "Elsewhere", "nomad", "Visit Lisbon"),
          hit("prefix", "Elsewhere", "nomad", "Lisbon visit"),
          hit("exact", "Elsewhere", "nomad", "Lisbon"),
        ],
        "lisbon",
      ).map((h) => h.id),
    ).toEqual(["exact", "prefix", "word", "substring"]);
  });

  it("keeps stable ties and adapter matches outside displayed text", () => {
    expect(rankResults([hit("b"), hit("a"), hit("keyword", "Elsewhere")], "lisbon").map((h) => h.id)).toEqual([
      "b",
      "a",
      "keyword",
    ]);
  });

  it("merges client hits and deduplicates only within a collection and kind", () => {
    const server = [hit("same")];
    const client = [hit("same"), hit("same", "Lisbon", "ph"), { ...hit("same"), kind: "countries" }];
    expect(mergeResults(server, client, "lisbon")).toEqual([server[0], client[1], client[2]]);
    expect(mergeResults(server, client, "   ")).toEqual([]);
  });

  it("applies per-collection and global caps after ranking", () => {
    const rows = Array.from({ length: 40 }, (_, i) => hit(String(i), "Lisbon", i < 20 ? "nomad" : "ph"));
    expect(mergeResults(rows, [], "lisbon")).toHaveLength(16);
    expect(
      mergeResults(rows, [], "lisbon", { perCollection: { nomad: 2, ph: 3 }, limit: 4 }).map((h) => h.collection),
    ).toEqual(["nomad", "nomad", "ph", "ph"]);
    expect(mergeResults(rows, [], "lisbon", { perCollection: 40 })).toHaveLength(30);
    expect(mergeResults(rows, [], "lisbon", { limit: 0 })).toEqual([]);
  });

  it("groups in stable collection order independent of hit ranking", () => {
    const rows = [
      hit("ph", "Lisbon", "ph"),
      hit("papers", "Lisbon", "papers"),
      hit("reddit", "Lisbon", "reddit"),
      hit("podcasts", "Lisbon", "podcasts"),
      hit("nomad"),
    ];
    expect(groupResults(rows).map((g) => g.id)).toEqual(["nomad", "podcasts", "reddit", "papers", "ph"]);
    expect(groupResults([hit("z", "Lisbon", "z"), ...rows, hit("a", "Lisbon", "a")]).map((g) => g.id)).toEqual([
      "nomad",
      "podcasts",
      "reddit",
      "papers",
      "ph",
      "a",
      "z",
    ]);
  });
});
