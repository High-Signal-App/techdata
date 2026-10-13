import { Provenance } from "@saas-maker/ui/blocks/record-detail";
import { ErrorState } from "@saas-maker/ui/components/error-state";
import { useCallback, useMemo, useRef } from "react";
import type { Envelope, Snapshot } from "../../adapters/reddit";
import type { Provenance as ProvenanceInfo } from "../../adapters/types";
import { useJsonResource } from "../../lib/resource";
import { useUrlParam } from "../../lib/url-state";

export type Loadable<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; value: Envelope<T> };
export function useApi<T>(key: string | null, initial?: Envelope<T>): [Loadable<T>, () => void] {
  const resource = useJsonResource<Envelope<T>>(key === null ? null : `/api/reddit/${key}`, initial);
  const removed = useRef<{ key: string | null; error: string } | null>(null);
  if (resource.status === "error" && "status" in resource.error && Number(resource.error.status) < 500)
    removed.current = { key, error: resource.error.message };
  // Retrying a removed revision must not briefly reveal its old cached rows.
  if (removed.current?.key === key && resource.status !== "error" && resource.data && !resource.isRevalidating)
    removed.current = null;
  // Cached captures may paint immediately only while their serving lease is valid.
  const data = resource.data?.data;
  const expired =
    data && typeof data === "object" && "expiresAt" in data && Date.parse(String(data.expiresAt)) <= Date.now();
  const state: Loadable<T> =
    removed.current?.key === key
      ? { status: "error", error: removed.current.error }
      : expired
        ? { status: "error", error: "expired" }
        : resource.status === "error"
          ? { status: "error", error: resource.error.message }
          : resource.data
            ? { status: "ready", value: resource.data }
            : { status: "loading" };
  return [state, resource.retry];
}
export function ReadError({ error, retry }: { error: string; retry: () => void }) {
  const messages: Record<string, string> = {
    "not-archived": "No snapshot was archived for this community and date.",
    "revision-removed": "This pinned revision was removed or redacted. It is no longer available.",
    expired: "This snapshot's 24-hour serving lease has expired.",
    invalid: "Choose a valid community, collection date and 12-character revision.",
  };
  return (
    <ErrorState
      title={messages[error]?.toLowerCase() ?? "the snapshot is unavailable."}
      description={null}
      onRetry={retry}
    />
  );
}

export function CaptureProvenance({ info }: { info: ProvenanceInfo }) {
  return (
    <Provenance
      info={{
        source: info.source,
        url: info.sourceUrl,
        via: info.via,
        viaUrl: info.viaUrl,
        collectedAt: info.collectedAt ?? undefined,
        readAt: info.fetchedAt,
        revision: info.revision,
        note: info.note,
      }}
    />
  );
}
export function Freshness({ snapshot: s }: { snapshot: Pick<Snapshot, "capturedAt" | "window" | "coverage"> }) {
  return (
    <p className="text-sm text-muted-foreground break-words">
      captured {s.capturedAt}, window {s.window.start}–{s.window.end} (UTC, start inclusive, end exclusive) · coverage:{" "}
      {s.coverage.status}
    </p>
  );
}
export function useSort(defaultId: string, initial: string | null = null) {
  const [sort, setSort] = useUrlParam("sort", initial);
  const [id, dir] = (sort ?? `${defaultId}:desc`).split(":");
  const sorting = useMemo(() => [{ id: id ?? defaultId, desc: dir !== "asc" }], [id, dir, defaultId]);
  const change = useCallback(
    (next: { id: string; desc: boolean }[]) =>
      setSort(next[0] ? `${next[0].id}:${next[0].desc ? "desc" : "asc"}` : null),
    [setSort],
  );
  return {
    sort: sorting,
    onSortChange: change,
  };
}
