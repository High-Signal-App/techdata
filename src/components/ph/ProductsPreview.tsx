import { createResourceClient, resourceClient, useResource } from "@saas-maker/ui/lib/use-resource";
import * as React from "react";
import type { PhPreview, PhSummary } from "../../adapters/ph/summary";
import { recordResearchEvent } from "../../lib/research-trace";
import { fetchJson } from "../../lib/resource";
import ProductsView from "./ProductsView";

/** Keep offscreen summary rows and closed-facet metadata out of the initial HTML. */
export default function ProductsPreview({ preview }: { preview: PhPreview }) {
  const client = React.useMemo(() => (typeof window === "undefined" ? createResourceClient() : resourceClient), []);
  const full = useResource<PhSummary>(
    "/data/ph/summary.json",
    async (signal) => {
      const summary = await fetchJson<PhSummary>("/data/ph/summary.json", signal);
      if (
        summary.version !== preview.version ||
        summary.sort !== preview.sort ||
        summary.total !== preview.total ||
        summary.withCategories !== preview.withCategories ||
        summary.provenance?.sha256 !== preview.provenance.sha256 ||
        !Array.isArray(summary.rows) ||
        !Array.isArray(summary.categories)
      )
        throw new Error("initial summary identity mismatch");
      return summary;
    },
    { client, staleTime: 300_000 },
  );
  React.useEffect(() => recordResearchEvent({ type: "preview_ready" }), []);
  React.useEffect(() => {
    if (full.status === "error") {
      recordResearchEvent({ type: "stage_failed", stage: "summary_load" });
    }
  }, [full.status]);
  return (
    <ProductsView
      summary={full.data ?? preview}
      previewOnly={!full.data}
      previewError={full.error?.message}
      retryPreview={() => void full.retry()}
    />
  );
}
