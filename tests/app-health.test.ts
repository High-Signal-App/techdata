import { afterEach, describe, expect, it, vi } from "vitest";
import { sendResearchLog } from "../src/lib/app-health";
import { createResearchTrace, type ResearchEventInput } from "../src/lib/research-trace";

const traceId = "ephemeral-tab-trace";

afterEach(() => vi.restoreAllMocks());

describe("TechData App Health browser logs", () => {
  it("sends allowlisted, content-free stages joined by the same ephemeral trace id", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    const timestamp = "2026-10-24T12:00:00.000Z";

    const trace = createResearchTrace(
      () => "?fleet_qa=1",
      () => new Date(timestamp),
      200,
      (item, id, label) => sendResearchLog(item, id, label),
      traceId,
    );
    trace.record({
      type: "search_result",
      queryPresent: true,
      filtersActive: false,
      resultCount: 3,
      query: "private search text",
    } as ResearchEventInput);
    trace.record({ type: "detail_inspected", rowSlug: "private-row-id" } as ResearchEventInput);
    trace.record({ type: "export_prepared", rowCount: 3, rows: ["private-row-id"] } as ResearchEventInput);

    const batches = fetch.mock.calls.map(
      ([, init]) =>
        JSON.parse(String(init?.body)) as {
          public_key: string;
          environment: string;
          schema_version: string;
          logs: { event: string; level: string; title: string; props: Record<string, unknown> }[];
        },
    );
    expect(batches).toHaveLength(3);
    expect(batches.map((batch) => batch.logs[0]?.props.trace_id)).toEqual([traceId, traceId, traceId]);
    expect(batches.map((batch) => batch.logs[0]?.event)).toEqual([
      "research.search_result",
      "research.detail_inspected",
      "research.export_prepared",
    ]);
    expect(batches[0]?.public_key).toMatch(/^ahk_pub_/);
    expect(batches[0]?.environment).toBe("production");
    expect(batches[0]?.schema_version).toBe("v1");
    expect(batches[0]?.logs[0]?.props).toEqual({
      workflow: "producthunt_catalog",
      traffic_label: "test",
      trace_id: traceId,
      query_present: true,
      filters_active: false,
      result_count: 3,
    });
    expect(batches[2]?.logs[0]?.props).toEqual({
      workflow: "producthunt_catalog",
      traffic_label: "test",
      trace_id: traceId,
      row_count: 3,
    });
    expect(batches.every((batch) => batch.logs[0]?.level === "info")).toBe(true);
    expect(batches.every((batch) => batch.logs[0]?.title === "TechData research workflow")).toBe(true);
    expect(Object.keys(batches[0]?.logs[0]?.props ?? {}).sort()).toEqual([
      "filters_active",
      "query_present",
      "result_count",
      "trace_id",
      "traffic_label",
      "workflow",
    ]);
    expect(JSON.stringify(batches)).not.toContain("private search text");
    expect(JSON.stringify(batches)).not.toContain("private-row-id");
  });

  it("fails open when App Health cannot be reached", () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(() =>
      sendResearchLog({ type: "preview_ready", occurredAt: "2026-10-24T12:00:00.000Z" }, traceId, "test"),
    ).not.toThrow();
  });
});
