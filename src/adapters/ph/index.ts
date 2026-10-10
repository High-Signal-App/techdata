import type { CollectionSummary } from "../types";
import { PH_META, phProvenance } from "./meta";

export const phAdapter = {
  id: "ph",
  async summary(): Promise<CollectionSummary> {
    return {
      id: "ph",
      label: PH_META.label,
      description: `Public product metadata · ${PH_META.coverageLabel}. Not a ranking: the catalogue has no votes/dates.`,
      counts: { products: PH_META.fullCount, "with categories": PH_META.fullWithCategories },
      provenance: phProvenance(),
      mode: "read-only",
    };
  },
};
