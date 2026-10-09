import { Provenance } from "@saas-maker/ui/blocks/record-detail";
import { Button } from "@saas-maker/ui/components/button";
import * as React from "react";
import type { Envelope, Snapshot } from "../../adapters/reddit";
import type { Provenance as ProvenanceInfo } from "../../adapters/types";
import { useUrlParam } from "../../lib/url-state";

export type Loadable<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; value: Envelope<T> };
export function useApi<T>(key: string | null): [Loadable<T>, () => void] {
  const [state, setState] = React.useState<Loadable<T> & { key: string | null }>({ status: "loading", key: null });
  const [nonce, setNonce] = React.useState(0);
  React.useEffect(() => {
    void nonce;
    setState({ status: "loading", key });
    if (!key) return;
    const ctrl = new AbortController();
    fetch(`/api/reddit/${key}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json()) as Envelope<T> & { error?: string };
        if (!r.ok) throw new Error(body.error ?? "unavailable");
        return body as Envelope<T>;
      })
      .then((value) => {
        if (!ctrl.signal.aborted) setState({ status: "ready", value, key });
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted)
          setState({ status: "error", key, error: e instanceof Error ? e.message : "unavailable" });
      });
    return () => ctrl.abort();
  }, [key, nonce]);
  return [state.key === key ? state : { status: "loading" }, () => setNonce((n) => n + 1)];
}
export function ReadError({ error, retry }: { error: string; retry: () => void }) {
  const messages: Record<string, string> = {
    "not-archived": "No snapshot was archived for this community and date.",
    "revision-removed": "This pinned revision was removed or redacted. It is no longer available.",
    expired: "This snapshot's 24-hour serving lease has expired.",
    invalid: "Choose a valid community, collection date and 12-character revision.",
  };
  return (
    <p className="text-sm text-muted-foreground" role="status">
      {messages[error] ?? "The snapshot is unavailable."}{" "}
      <Button variant="link" size="xs" onClick={retry}>
        try again
      </Button>
    </p>
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
export function Freshness({ snapshot: s }: { snapshot: Snapshot }) {
  return (
    <p className="text-sm text-muted-foreground break-words">
      captured {s.capturedAt}, window {s.window.start}–{s.window.end} (UTC, start inclusive, end exclusive) · coverage:{" "}
      {s.coverage.status}
    </p>
  );
}
export function useSort(defaultId: string) {
  const [sort, setSort] = useUrlParam("sort");
  const [id, dir] = (sort ?? `${defaultId}:desc`).split(":");
  return {
    sort: [{ id: id ?? defaultId, desc: dir !== "asc" }],
    onSortChange: (next: { id: string; desc: boolean }[]) =>
      setSort(next[0] ? `${next[0].id}:${next[0].desc ? "desc" : "asc"}` : null),
  };
}
