import type { SearchResult, SearchSource } from "@saas-maker/ui/blocks/search-palette";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nomadProvenance } from "../src/adapters/nomad/meta";
import GlobalSearch from "../src/components/GlobalSearch";
import { type PinnedItem, pinFromColumns } from "../src/lib/compare";

const mocks = vi.hoisted(() => ({
  props: undefined as
    | { sources: SearchSource[]; onOpenChange: (open: boolean) => void; onSelect: (result: SearchResult) => void }
    | undefined,
  searchPh: vi.fn(),
  pins: [] as PinnedItem[],
}));
vi.mock("@saas-maker/ui/blocks/search-palette", () => ({
  SearchPalette: (props: typeof mocks.props) => {
    mocks.props = props;
    return null;
  },
}));
vi.mock("../src/adapters/ph/query", () => ({ searchPh: mocks.searchPh }));
vi.mock("../src/lib/local-lists", () => ({ usePins: () => ({ items: mocks.pins }) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mocks.pins = [];
});

function source(id: string): SearchSource {
  const s = mocks.props?.sources.find((s) => s.id === id);
  if (!s) throw new Error(`Missing palette source: ${id}`);
  return s;
}

// Exercise the palette source boundary with real React hooks; no network or browser engine.
describe("global search sources", () => {
  it("loads nothing until opened, shares one request, and merges lazy PH results", async () => {
    let release!: (hits: unknown[]) => void;
    mocks.searchPh.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const fetch = vi.fn(async () =>
      Response.json({
        hits: [
          {
            collection: "nomad",
            kind: "places",
            id: "lisbon-portugal",
            title: "Lisbon",
            href: "/nomad/?place=lisbon-portugal",
          },
        ],
        collections: [],
        provenance: {},
      }),
    );
    vi.stubGlobal("fetch", fetch);
    renderToStaticMarkup(createElement(GlobalSearch));
    const props = mocks.props;
    if (!props) throw new Error("Palette did not render");
    await Promise.all(props.sources.map((s) => s.search("lisbon")));
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.searchPh).not.toHaveBeenCalled();
    props.onOpenChange(true);
    await Promise.all(props.sources.map((s) => s.search("")));
    expect(fetch).not.toHaveBeenCalled();
    const groups = Object.fromEntries(
      await Promise.all(props.sources.map(async (s) => [s.id, await s.search("lisbon")])),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/search?q=lisbon");
    expect(groups.nomad[0]).toMatchObject({ title: "Lisbon", subtitle: "places" });
    expect(groups.ph[0].title).toBe("Loading PH Catalog…");
    await vi.waitFor(() => expect(mocks.searchPh).toHaveBeenCalledTimes(1));
    // PH contract hit; query mechanics and full-export provenance are covered by ph.test.ts.
    release([
      { collection: "ph", kind: "products", id: "fixture-slug", title: "Lisbon", href: "/ph/?product=fixture-slug" },
    ]);
    await vi.waitFor(async () => {
      expect(await source("ph").search("lisbon")).toMatchObject([
        { href: "/ph/?product=fixture-slug", subtitle: "products" },
      ]);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    props.onOpenChange(false);
    expect(await source("ph").search("lisbon")).toEqual([]);
  });

  it("keeps same-view history navigation and other-view navigation", () => {
    const pushState = vi.fn();
    const assign = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("location", { href: "https://techdata.example/ph/", pathname: "/ph/", assign });
    vi.stubGlobal("history", { pushState });
    vi.stubGlobal("dispatchEvent", dispatchEvent);
    vi.stubGlobal(
      "PopStateEvent",
      class {
        constructor(readonly type: string) {}
      },
    );
    renderToStaticMarkup(createElement(GlobalSearch));
    const props = mocks.props;
    if (!props) throw new Error("Palette did not render");
    props.onSelect({ id: "product", title: "Contract hit", href: "/ph/?product=fixture-slug" });
    expect(pushState).toHaveBeenCalledWith(null, "", "/ph/?product=fixture-slug");
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "popstate" }));
    expect(assign).not.toHaveBeenCalled();
    props.onSelect({ id: "paper", title: "Contract hit", href: "/papers/?paper=fixture-id" });
    expect(assign).toHaveBeenCalledWith("https://techdata.example/papers/?paper=fixture-id");
  });

  it("turns a rejected PH engine into a quiet note while keeping server results", async () => {
    mocks.searchPh.mockRejectedValue(new Error("engine failed"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ hits: [], collections: [], provenance: {} })),
    );
    renderToStaticMarkup(createElement(GlobalSearch));
    const props = mocks.props;
    if (!props) throw new Error("Palette did not render");
    props.onOpenChange(true);
    await source("nomad").search("test");
    await vi.waitFor(async () => {
      expect(await source("ph").search("test")).toEqual([{ id: "ph-status", title: "PH catalog unavailable" }]);
    });
  });

  it("searches pinned records in their own group without fetching a collection", async () => {
    const pin = pinFromColumns("/nomad/", "lisbon-portugal", "Lisbon", {}, [], nomadProvenance, "place");
    if (!pin) throw new Error("Pin did not validate");
    mocks.pins = [pin];
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderToStaticMarkup(createElement(GlobalSearch));
    expect(source("pinned").label).toBe("pinned");
    expect(await source("pinned").search("LISBON")).toMatchObject([{ title: "Lisbon", href: pin.href }]);
    expect(await source("pinned").search("no match")).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
