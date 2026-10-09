import type { CollectionSummary } from "../types";
import { PH_META, phProvenance } from "./meta";

export const phAdapter = {
  id: "ph",
  async summary(): Promise<CollectionSummary> {
    return {
      id: "ph",
      label: PH_META.label,
      description: `Public product metadata · ${PH_META.sampleLabel}. Not a ranking: the catalogue has no votes/dates.`,
      counts: { "sample products": PH_META.sampleCount },
      provenance: phProvenance(),
      mode: "read-only",
    };
  },
};
