import type { CollectionSummary, Provenance } from "../types";

/**
 * Where the Nomad Atlas snapshot came from. The JSON in public/data/nomad is
 * byte-identical to nomad-data-adventure's cities.json (checked in tests).
 */
export const NOMAD_SNAPSHOT = {
  file: "/data/nomad/cities.json",
  sha256: "281f9438493efa02c651f0720ef209c68eccf85abc0e500ebb43b53de42e7fd4",
  sourceRepo: "Significant-Hobbies/nomad-data-adventure",
  sourceCommit: "517cbeb",
  copiedFromCommit: "3ab6a63",
  records: 1383,
  explorable: 1374,
  countries: 205,
  metrics: 22,
} as const;

export const nomadProvenance: Provenance = {
  source: "Nomads.com",
  sourceUrl: "https://nomads.com/",
  via: "Nomad Atlas snapshot",
  viaUrl: "https://nomad.significanthobbies.com/",
  collectedAt: "2026-09-07",
  revision: `nomad-data-adventure ${NOMAD_SNAPSHOT.sourceCommit}`,
  note: "A saved snapshot, not live prices, visa rules or conditions. Missing values stay missing; unusual source estimates are flagged, not rewritten.",
};

export const nomadSummary: CollectionSummary = {
  id: "nomad",
  label: "Nomad Atlas",
  description: "Cost of living, internet and everyday-life scores for places worldwide.",
  counts: { places: NOMAD_SNAPSHOT.explorable, countries: NOMAD_SNAPSHOT.countries },
  provenance: nomadProvenance,
  mode: "read-only",
};

/** The same provenance in the shape of the UI library's Provenance block. */
export const nomadProvenanceInfo = {
  source: nomadProvenance.source,
  url: nomadProvenance.sourceUrl,
  collectedAt: nomadProvenance.collectedAt ?? undefined,
  revision: nomadProvenance.revision,
  note: `Via ${nomadProvenance.via}. ${nomadProvenance.note}`,
};
