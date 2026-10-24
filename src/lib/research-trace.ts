import { sendResearchLog } from "./app-health";

export type ResearchTrafficLabel = "test" | "unclassified";

type TraceFailure = {
  type: "stage_failed";
  stage: "summary_load" | "full_catalog_load" | "search_query" | "detail_lookup" | "export_prepare";
};

export type ResearchEventInput =
  | { type: "preview_ready" }
  | { type: "full_catalog_ready" }
  | TraceFailure
  | {
      type: "search_result";
      queryPresent: boolean;
      filtersActive: boolean;
      resultCount: number;
    }
  | { type: "result_selected" }
  | { type: "detail_inspected" }
  | { type: "inspection_closed" }
  | { type: "export_prepared"; rowCount: number }
  | { type: "download_requested"; format: "csv" | "json" };

export type ResearchEvent = ResearchEventInput & { occurredAt: string };

export type ResearchTrace = {
  schemaVersion: 1;
  projectId: "techdata";
  workflow: "producthunt_catalog";
  trafficLabel: ResearchTrafficLabel;
  startedAt: string | null;
  endedAt: string | null;
  events: ResearchEvent[];
  droppedCount: number;
  complete: boolean;
};

export const MAX_RESEARCH_TRACE_EVENTS = 200;

export function researchTrafficLabel(search: string): ResearchTrafficLabel {
  return new URLSearchParams(search).get("fleet_qa") === "1" ? "test" : "unclassified";
}

function sanitizeEvent(event: ResearchEventInput): ResearchEventInput {
  switch (event.type) {
    case "preview_ready":
    case "full_catalog_ready":
    case "result_selected":
    case "detail_inspected":
    case "inspection_closed":
      return { type: event.type };
    case "stage_failed":
      if (
        event.stage !== "summary_load" &&
        event.stage !== "full_catalog_load" &&
        event.stage !== "search_query" &&
        event.stage !== "detail_lookup" &&
        event.stage !== "export_prepare"
      )
        throw new Error("Unsupported research failure stage");
      return {
        type: "stage_failed",
        stage: event.stage,
      };
    case "search_result":
      return {
        type: "search_result",
        queryPresent: event.queryPresent === true,
        filtersActive: event.filtersActive === true,
        resultCount: safeCount(event.resultCount),
      };
    case "export_prepared":
      return { type: "export_prepared", rowCount: safeCount(event.rowCount) };
    case "download_requested":
      return {
        type: "download_requested",
        format: event.format === "csv" ? "csv" : "json",
      };
    default:
      throw new Error("Unsupported research event");
  }
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1_000_000_000, Math.trunc(value))) : 0;
}

export function createResearchTrace(
  getSearch: () => string,
  now: () => Date = () => new Date(),
  maxEvents = MAX_RESEARCH_TRACE_EVENTS,
  onEvent?: (event: ResearchEvent, traceId: string, trafficLabel: ResearchTrafficLabel) => void,
  traceId = "",
) {
  const eventLimit = Math.max(1, Math.min(MAX_RESEARCH_TRACE_EVENTS, Math.trunc(maxEvents) || 1));
  let snapshot: ResearchTrace = {
    schemaVersion: 1,
    projectId: "techdata",
    workflow: "producthunt_catalog",
    trafficLabel: "unclassified",
    startedAt: null,
    endedAt: null,
    events: [],
    droppedCount: 0,
    complete: true,
  };
  const subscribers = new Set<() => void>();

  function record(input: ResearchEventInput) {
    const occurredAt = now().toISOString();
    const payload = sanitizeEvent(input);
    const events = snapshot.events;
    const droppedCount =
      events.length < eventLimit ? snapshot.droppedCount : Math.min(Number.MAX_SAFE_INTEGER, snapshot.droppedCount + 1);
    const nextEvents = events.length < eventLimit ? [...events, { ...payload, occurredAt } as ResearchEvent] : events;
    snapshot = {
      ...snapshot,
      trafficLabel: snapshot.startedAt === null ? researchTrafficLabel(getSearch()) : snapshot.trafficLabel,
      startedAt: snapshot.startedAt ?? occurredAt,
      endedAt: occurredAt,
      events: nextEvents,
      droppedCount,
      complete: droppedCount === 0,
    };
    if (onEvent) {
      try {
        onEvent({ ...payload, occurredAt } as ResearchEvent, traceId, snapshot.trafficLabel);
      } catch {
        // Outcome logging must never interrupt the research workflow.
      }
    }
    for (const subscriber of subscribers) subscriber();
  }

  return {
    record,
    getSnapshot: () => snapshot,
    subscribe(subscriber: () => void) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
}

const pageTraceId =
  typeof window !== "undefined" && typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "";
const pageTrace = createResearchTrace(
  () => (typeof window === "undefined" ? "" : window.location.search),
  undefined,
  MAX_RESEARCH_TRACE_EVENTS,
  (event, traceId, trafficLabel) => sendResearchLog(event, traceId, trafficLabel),
  pageTraceId,
);

export const recordResearchEvent = pageTrace.record;
export const getResearchTrace = pageTrace.getSnapshot;
export const subscribeResearchTrace = pageTrace.subscribe;
