import type { DataColumn } from "@saas-maker/ui/components/data-table";
import { type Claim, speakerLabel } from "../adapters/podcasts";
import type { Provenance } from "../adapters/types";
import { pinFromColumns } from "./compare";

export const claimColumns: DataColumn<Claim>[] = [
  {
    id: "assertion",
    header: "claim",
    value: (c) => c.assertion,
    hideable: false,
    minWidth: "18rem",
    cell: (c) => c.assertion,
  },
  { id: "speaker", header: "speaker", value: speakerLabel },
  { id: "claimType", header: "type", value: (c) => c.claimType },
  { id: "showName", header: "show", value: (c) => c.showName },
  { id: "saidOn", header: "said on", value: (c) => c.saidOn },
];
export function pinClaim(claim: Claim, provenance: Provenance | undefined) {
  return pinFromColumns(
    "/podcasts/claims/",
    claim.id,
    claim.assertion,
    claim,
    [
      ...claimColumns,
      { id: "quote", header: "verbatim quote", value: (c) => c.quote },
      { id: "episode", header: "episode", value: (c) => c.episodeTitle },
      { id: "timestamp", header: "timestamp (seconds)", value: (c) => c.timestampS },
    ],
    provenance,
    "claim",
    {},
    claim.sourceUrl ?? undefined,
  );
}
