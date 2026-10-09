/**
 * The adapter contract. Every collection keeps its own record shape; an
 * adapter only promises these few operations plus where the data came from.
 * There is deliberately no shared record schema.
 */

export type Provenance = {
  /** Who produced the data, e.g. "Nomads.com". */
  source: string;
  sourceUrl: string;
  /** The system techdata read it from (a saved snapshot, a public API). */
  via: string;
  viaUrl: string;
  /** When the source data was collected (snapshot) or fetched (live API), ISO. */
  collectedAt: string | null;
  fetchedAt?: string;
  /** Pinned revision of the snapshot, when there is one. */
  revision?: string;
  note?: string;
};

export type CollectionSummary = {
  id: string;
  label: string;
  description: string;
  /** Record counts by kind, only real counts from the source. */
  counts: Record<string, number>;
  provenance: Provenance;
  /** Read-only until parity with the source's own site is verified. */
  mode: "read-only";
};

export type SearchHit = {
  collection: string;
  kind: string;
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  href: string;
};

export type Page<T> = { rows: T[]; total: number; limit: number; offset: number };

export interface CollectionAdapter {
  id: string;
  summary(): Promise<CollectionSummary>;
  /** Small, fast hits for the ⌘K palette. */
  search(query: string, limit?: number): Promise<SearchHit[]>;
}
