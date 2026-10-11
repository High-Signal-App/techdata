import { ExportMenu } from "@saas-maker/ui/blocks/export-menu";
import { ActiveFilters, FacetFilter, FilterBar, FilterSearch, useUrlFilters } from "@saas-maker/ui/blocks/filter-bar";
import { KeyValueList, RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import { RecordDetailSkeleton } from "@saas-maker/ui/blocks/skeletons";
import type { DataColumn } from "@saas-maker/ui/components/data-table";
import { SkeletonText } from "@saas-maker/ui/components/skeleton";
import { type FilterDef, facetCounts, filterRows } from "@saas-maker/ui/lib/filters";
import type { Catalog, CatalogEntry, Snapshot } from "../../adapters/reddit";
import { snapshotHref } from "../../adapters/reddit";
import { pinFromColumns } from "../../lib/compare";
import { useUrlParam } from "../../lib/url-state";
import PinButton from "../views/PinButton";
import SaveView from "../views/SaveView";
import DataTable from "../views/ViewTable";
import { CaptureProvenance, Freshness, ReadError, useApi, useSort } from "./shared";

type Community = CatalogEntry & { dates: string[] };
const defs: FilterDef<Community>[] = [
  { kind: "facet", id: "coverage", label: "coverage", value: (e) => e.coverage.status },
  { kind: "facet", id: "date", label: "date available", value: (e) => e.dates },
];
const columns: DataColumn<Community>[] = [
  { id: "subreddit", header: "subreddit", value: (e) => e.subreddit, hideable: false },
  { id: "posts", header: "latest posts", value: (e) => e.coverage.posts, align: "right" },
  { id: "comments", header: "retained comments", value: (e) => e.coverage.comments, align: "right" },
  { id: "coverage", header: "latest coverage", value: (e) => e.coverage.status },
  { id: "date", header: "latest date", value: (e) => e.date },
  { id: "dates", header: "dates available", value: (e) => e.dates.join(", ") },
];
export default function CommunitiesView() {
  const [state, retry] = useApi<Catalog>("catalog");
  const [filters, setFilters] = useUrlFilters(defs);
  const [community, setCommunity] = useUrlParam("community");
  const sort = useSort("subreddit");
  const map = new Map<string, Community>();
  if (state.status === "ready")
    for (const e of state.value.data.entries
      .filter((entry) => Date.parse(entry.expiresAt) > Date.now())
      .sort((a, b) => b.date.localeCompare(a.date) || b.capturedAt.localeCompare(a.capturedAt))) {
      const existing = map.get(e.subreddit);
      if (existing) {
        if (!existing.dates.includes(e.date)) existing.dates.push(e.date);
      } else map.set(e.subreddit, { ...e, dates: [e.date] });
    }
  const all = [...map.values()];
  const search = (e: Community) => e.subreddit;
  const rows = filterRows(all, defs, filters, { search });
  const selected = all.find((e) => e.subreddit === community);
  const pin = (e: Community) =>
    pinFromColumns(
      "/reddit/",
      e.subreddit,
      `r/${e.subreddit}`,
      e,
      columns,
      state.status === "ready"
        ? { ...state.value.provenance, collectedAt: e.capturedAt, revision: e.source.revision }
        : undefined,
      "community",
      {},
      `https://www.reddit.com/r/${encodeURIComponent(e.subreddit)}/`,
    );
  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <SaveView />
        <FilterSearch
          value={filters.q ?? ""}
          onChange={(q) => setFilters({ ...filters, q })}
          placeholder="Find a subreddit…"
        />
        {defs.map((d) => (
          <FacetFilter
            key={d.id}
            label={d.label}
            options={facetCounts(all, defs, filters, d.id, { search })}
            selected={filters.facets[d.id] ?? []}
            onChange={(v) => setFilters({ ...filters, facets: { ...filters.facets, [d.id]: v } })}
          />
        ))}
      </FilterBar>
      <ActiveFilters defs={defs} state={filters} onChange={setFilters} />
      <div className="capture-metadata">
        {state.status === "ready" ? (
          <p className="text-sm text-muted-foreground">
            catalog generated {state.value.data.generatedAt}; latest capture {state.value.provenance.collectedAt}.
            Select a community for its exact collection window.
          </p>
        ) : state.status === "loading" ? (
          <SkeletonText lines={3} />
        ) : null}
      </div>
      <RecordLayout>
        <DataTable
          pin={pin}
          label="Subreddits"
          data={rows}
          columns={columns}
          getRowId={(e) => e.subreddit}
          {...sort}
          status={state.status}
          onRetry={retry}
          error={state.status === "error" ? <ReadError error={state.error} retry={retry} /> : undefined}
          onRowClick={(e) => setCommunity(e.subreddit)}
          selectedId={community}
          toolbar={(view) => (
            <>
              {rows.length} communities{" "}
              <ExportMenu
                rows={view.rows}
                columns={[
                  ...columns.map((c) => ({ id: c.id, value: c.value })),
                  ...["capturedAt", "revision", "source"].map((id) => ({
                    id,
                    value: (e: Community) =>
                      id === "revision"
                        ? e.source.revision
                        : id === "source"
                          ? "Reddit, via Reddit Insights capture runs"
                          : e.capturedAt,
                  })),
                ]}
                filename="reddit-communities"
                meta={state.status === "ready" ? { ...state.value.provenance, filters } : undefined}
              />
            </>
          )}
        />
        <RecordDetail
          actions={selected && <PinButton item={pin(selected)} />}
          open={!!community}
          onOpenChange={(v) => !v && setCommunity(null)}
          title={community ? `r/${community}` : "subreddit"}
        >
          {selected && <CommunityDetail entry={selected} />}
          {community && !selected && state.status === "ready" && <p>This community is no longer in the catalog.</p>}
        </RecordDetail>
      </RecordLayout>
      {state.status === "ready" && <CaptureProvenance info={state.value.provenance} />}
    </div>
  );
}
function CommunityDetail({ entry }: { entry: Community }) {
  const [state, retry] = useApi<Snapshot>(
    `snapshots/${entry.date}/${encodeURIComponent(entry.subreddit)}?v=${entry.source.revision.slice(0, 12)}`,
  );
  return (
    <>
      <KeyValueList
        items={[
          { label: "dates available", value: entry.dates.join(", ") },
          { label: "coverage", value: entry.coverage.status },
          { label: "captured", value: entry.capturedAt },
        ]}
      />
      <a className="text-sm underline underline-offset-4" href={snapshotHref(entry)}>
        open captured threads
      </a>
      {state.status === "loading" && <RecordDetailSkeleton className="border-0 rounded-none max-w-none" />}
      {state.status === "error" && <ReadError error={state.error} retry={retry} />}
      {state.status === "ready" && (
        <>
          <Freshness snapshot={state.value.data} />
          <CaptureProvenance info={state.value.provenance} />
        </>
      )}
    </>
  );
}
