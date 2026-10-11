import { Provenance } from "@saas-maker/ui/blocks/record-detail";
import { RecordDetailSkeleton } from "@saas-maker/ui/blocks/skeletons";
import { ErrorState } from "@saas-maker/ui/components/error-state";
import type { ExportColumn } from "@saas-maker/ui/lib/export";
import type { Envelope } from "../../adapters/papers";
import type { Provenance as ProvenanceInfo } from "../../adapters/types";
import { useJsonResource } from "../../lib/resource";

export function usePapersApi<T>(key: string | null, initial?: Envelope<T>) {
  const resource = useJsonResource<Envelope<T>>(key === null ? null : `/api/papers/${key}`, initial);
  return [
    {
      status: resource.status === "error" ? "error" : resource.data ? "ready" : "loading",
      value: resource.status === "error" ? undefined : resource.data,
    } as { status: "loading" | "error" | "ready"; value?: Envelope<T> },
    resource.retry,
  ] as const;
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
export function LoadingDetail({ error, retry }: { error: boolean; retry: () => void }) {
  return error ? (
    <ErrorState title="this public record did not load." description={null} onRetry={retry} />
  ) : (
    <RecordDetailSkeleton className="border-0 rounded-none max-w-none" />
  );
}
export function MissingExports({ missing }: { missing: string[] }) {
  return (
    <div className="min-h-8">
      {missing.length ? (
        <p role="status" className="my-3 text-sm text-muted-foreground">
          Unavailable public exports: {missing.join(", ")}. Results cover available files only.
        </p>
      ) : null}
    </div>
  );
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
