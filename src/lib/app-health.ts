import { APP_HEALTH_PUBLIC_KEY } from "./app-health-config";
import { createPingWeb } from "./ping-web";
import type { ResearchEvent, ResearchTrafficLabel } from "./research-trace";

const client = createPingWeb({ publicKey: APP_HEALTH_PUBLIC_KEY, environment: "production" });

/** Send only content-free research outcomes. The random trace id lives in page memory only. */
export function sendResearchLog(event: ResearchEvent, traceId: string, trafficLabel: ResearchTrafficLabel): void {
  const props: Record<string, string | number | boolean> = {
    workflow: "producthunt_catalog",
    traffic_label: trafficLabel,
    trace_id: traceId,
  };

  if (event.type === "stage_failed") props.stage = event.stage;
  if (event.type === "search_result") {
    props.query_present = event.queryPresent;
    props.filters_active = event.filtersActive;
    props.result_count = event.resultCount;
  }
  if (event.type === "export_prepared") props.row_count = event.rowCount;
  if (event.type === "download_requested") props.format = event.format;

  client(`research.${event.type}`, {
    title: "TechData research workflow",
    props,
  });
}
