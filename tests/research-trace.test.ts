import { describe, expect, it } from "vitest";
import { createResearchTrace, type ResearchEventInput, researchTrafficLabel } from "../src/lib/research-trace";

describe("content-free Product Hunt research trace", () => {
  it("labels only the explicit QA marker as test traffic", () => {
    expect(researchTrafficLabel("?fleet_qa=1")).toBe("test");
    expect(researchTrafficLabel("?fleet_qa=true")).toBe("unclassified");
    expect(researchTrafficLabel("?fleet_qa=0")).toBe("unclassified");
    expect(researchTrafficLabel("")).toBe("unclassified");
  });

  it("keeps only allowlisted fields and records bounded stage outcomes", () => {
    const trace = createResearchTrace(
      () => "?fleet_qa=1",
      () => new Date("2026-10-24T00:00:00.000Z"),
    );
    trace.record({
      type: "search_result",
      queryPresent: true,
      filtersActive: true,
      resultCount: 3,
      query: "private",
    } as ResearchEventInput);
    trace.record({ type: "stage_failed", stage: "detail_lookup", rawError: "private" } as ResearchEventInput);

    expect(trace.getSnapshot()).toEqual({
      schemaVersion: 1,
      projectId: "techdata",
      workflow: "producthunt_catalog",
      trafficLabel: "test",
      startedAt: "2026-10-24T00:00:00.000Z",
      endedAt: "2026-10-24T00:00:00.000Z",
      events: [
        {
          type: "search_result",
          queryPresent: true,
          filtersActive: true,
          resultCount: 3,
          occurredAt: "2026-10-24T00:00:00.000Z",
        },
        {
          type: "stage_failed",
          stage: "detail_lookup",
          occurredAt: "2026-10-24T00:00:00.000Z",
        },
      ],
      droppedCount: 0,
      complete: true,
    });
    expect(JSON.stringify(trace.getSnapshot())).not.toContain("private");
  });

  it("marks a capped trace incomplete and counts every omitted event", () => {
    const trace = createResearchTrace(
      () => "",
      () => new Date("2026-10-24T00:00:00.000Z"),
      2,
    );
    trace.record({ type: "preview_ready" });
    trace.record({ type: "full_catalog_ready" });
    trace.record({ type: "result_selected" });
    trace.record({ type: "detail_inspected" });

    expect(trace.getSnapshot().events.map((event) => event.type)).toEqual(["preview_ready", "full_catalog_ready"]);
    expect(trace.getSnapshot().droppedCount).toBe(2);
    expect(trace.getSnapshot().complete).toBe(false);
  });
});
