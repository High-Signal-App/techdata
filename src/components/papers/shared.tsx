import { Provenance } from "@saas-maker/ui/blocks/record-detail";
import { Skeleton } from "@saas-maker/ui/components/skeleton";
import type { ExportColumn } from "@saas-maker/ui/lib/export";
import * as React from "react";
import type { Envelope } from "../../adapters/papers";
import type { Provenance as ProvenanceInfo } from "../../adapters/types";

export function usePapersApi<T>(key: string | null) {
  const [state, setState] = React.useState<{ status: "loading" | "error" | "ready"; value?: Envelope<T> }>({
    status: "loading",
  });
  const [nonce, setNonce] = React.useState(0);
  React.useEffect(() => {
    if (key === null) return;
    void nonce;
    const ctrl = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/papers/${key}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Envelope<T>>) : Promise.reject(new Error(String(r.status)))))
      .then((value) => setState({ status: "ready", value }))
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setState({ status: "error" });
      });
    return () => ctrl.abort();
  }, [key, nonce]);
  return [state, () => setNonce((n) => n + 1)] as const;
}
export function PublicProvenance({ info }: { info: ProvenanceInfo }) {
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
export function LoadingDetail({ error }: { error: boolean }) {
  return error ? (
    <p className="text-sm">This public record did not load. Close and reopen to try again.</p>
  ) : (
    <Skeleton className="h-40 w-full" />
  );
}
export function MissingExports({ missing }: { missing: string[] }) {
  return missing.length ? (
    <p role="status" className="my-3 text-sm text-muted-foreground">
      Unavailable public exports: {missing.join(", ")}. Results cover available files only.
    </p>
  ) : null;
}
/** CSV must carry provenance too; JSON additionally wraps this in metadata. */
export function provenanceColumns<T>(info: ProvenanceInfo): ExportColumn<T>[] {
  return ["source", "sourceUrl", "via", "viaUrl", "collectedAt", "fetchedAt"]
    .map((key) => ({ id: key, value: () => info[key as keyof ProvenanceInfo] ?? null }))
    .concat([{ id: "license", value: () => "CC-BY 4.0" }]);
}
export const showValue = (v: unknown): string =>
  v == null || v === ""
    ? "not recorded"
    : Array.isArray(v)
      ? v.join(", ")
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
