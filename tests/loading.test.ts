import { createResourceClient, resourceClient } from "@saas-maker/ui/lib/use-resource";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaimList } from "../src/components/podcasts/shared";
import PostsView from "../src/components/reddit/PostsView";
import ViewTable from "../src/components/views/ViewTable";
import { fetchJson } from "../src/lib/resource";

afterEach(() => vi.unstubAllGlobals());

const columns = [
  { id: "name", header: "name", value: (row: { name: string }) => row.name, minWidth: "18rem", hideable: false },
  { id: "hidden", header: "hidden", value: () => 1, hidden: true },
];
const table = (status: "loading" | "ready" | "error", data: { name: string }[] = []) =>
  renderToStaticMarkup(
    createElement(ViewTable<{ name: string }>, {
      label: "records",
      columns,
      data,
      getRowId: (row) => row.name,
      status,
      empty: "no records match.",
      error: "the source did not answer.",
      onRetry: () => {},
    }),
  );

describe("resource loading states", () => {
  it("puts shaped table and quote placeholders in server HTML with loaded column widths", () => {
    const html = table("loading");
    expect(html).toContain('data-slot="data-table-skeleton"');
    expect(html).toContain("min-width:18rem");
    expect(html).not.toContain(">hidden<");
    expect(html).not.toContain("animate-spin");
    expect(table("ready", [{ name: "record" }])).toContain("min-width:18rem");
    expect(renderToStaticMarkup(createElement(PostsView))).toContain('data-slot="data-table-skeleton"');
    expect(renderToStaticMarkup(createElement(ClaimList, { claims: [], status: "loading" }))).toContain(
      'data-slot="quote-list-skeleton"',
    );
  });

  it("renders explicit empty and error states with a retry action", () => {
    expect(table("ready")).toContain('data-slot="empty-state"');
    expect(table("ready")).toContain("no records match.");
    const error = table("error");
    expect(error).toContain('data-slot="error-state"');
    expect(error).toContain("the source did not answer.");
    expect(error).toContain("try again");
    expect(renderToStaticMarkup(createElement(ClaimList, { claims: [], status: "ready" }))).toContain(
      'data-slot="empty-state"',
    );
    expect(
      renderToStaticMarkup(createElement(ClaimList, { claims: [], status: "error", onRetry: () => {} })),
    ).toContain("try again");
  });

  it("passes numeric HTTP status through, including non-JSON failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 410 })),
    );
    await expect(fetchJson("/api/reddit/snapshots/test", new AbortController().signal)).rejects.toMatchObject({
      status: 410,
      message: "unavailable",
    });
  });

  it("retries 5xx but fails fast on 4xx; an explicit retry can recover", async () => {
    const client = createResourceClient();
    const get = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"upstream"}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"rows":[1]}'));
    vi.stubGlobal("fetch", get);
    const read = (signal: AbortSignal) => fetchJson("/api/papers/papers", signal);
    await client.run("papers", read, { retryDelay: 1, cacheTime: 0 });
    expect(get).toHaveBeenCalledTimes(2);
    expect(client.entry("papers").snapshot.data).toEqual({ rows: [1] });

    get.mockReset().mockResolvedValueOnce(new Response('{"error":"expired"}', { status: 410 }));
    await client.run("capture", read, { retryDelay: 1, cacheTime: 0 });
    expect(get).toHaveBeenCalledTimes(1);
    expect(client.entry("capture").snapshot.error).toMatchObject({ status: 410 });
    get.mockResolvedValueOnce(new Response('{"rows":[]}'));
    await client.run("capture", read, { cacheTime: 0 });
    expect(client.entry("capture").snapshot).toMatchObject({ data: { rows: [] }, error: undefined });
  });

  it("deduplicates reads and keeps cached content while revalidating", async () => {
    const client = createResourceClient();
    client.mutate("rows", ["cached"]);
    let resolve!: (rows: string[]) => void;
    const read = vi.fn(
      () =>
        new Promise<string[]>((done) => {
          resolve = done;
        }),
    );
    const first = client.run("rows", read, { cacheTime: 0 });
    const second = client.run("rows", read, { cacheTime: 0 });
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    expect(client.entry("rows").snapshot).toMatchObject({ data: ["cached"], fetching: true });
    resolve(["fresh"]);
    await Promise.all([first, second]);
    expect(client.entry("rows").snapshot).toMatchObject({ data: ["fresh"], fetching: false });
  });

  it("restores public data immediately in a new client within the session TTL", async () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    });
    const persist = { ttl: 60_000 };
    const first = createResourceClient();
    await first.prefetch("public", async () => ["cached"], { persist, cacheTime: 0 });
    expect(createResourceClient().entry("public", { persist }).snapshot.data).toEqual(["cached"]);
    const expired = createResourceClient().entry("public", { persist: { ttl: -1 } });
    expect(expired.snapshot.data).toBeUndefined();
  });

  it("discards persistent data when the API reports a removed record", async () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
    });
    const url = "/api/reddit/snapshots/removed";
    const persist = { ttl: 60_000 };
    await resourceClient.prefetch(url, async () => ({ data: "cached" }), { persist, cacheTime: 0 });
    expect(stored.size).toBe(1);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"revision-removed"}', { status: 410 })),
    );
    await expect(fetchJson(url, new AbortController().signal)).rejects.toMatchObject({ status: 410 });
    expect(createResourceClient().entry(url, { persist }).snapshot.data).toBeUndefined();
  });

  it("aborts an obsolete request without publishing its error or data", async () => {
    const client = createResourceClient();
    const unsubscribe = client.subscribe("obsolete", () => {}, 0);
    let signal: AbortSignal | undefined;
    const request = client.run(
      "obsolete",
      (next) => {
        signal = next;
        return new Promise((_, reject) =>
          next.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError"))),
        );
      },
      { cacheTime: 0 },
    );
    await Promise.resolve();
    unsubscribe();
    await request;
    expect(signal?.aborted).toBe(true);
    expect(client.entry("obsolete").snapshot).toMatchObject({ data: undefined, error: undefined, fetching: false });
  });
});
