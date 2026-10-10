import { ExportMenu } from "@saas-maker/ui/blocks/export-menu";
import { FilterBar, FilterSearch } from "@saas-maker/ui/blocks/filter-bar";
import { KeyValueList, RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import type { DataColumn } from "@saas-maker/ui/components/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@saas-maker/ui/components/select";
import { Skeleton } from "@saas-maker/ui/components/skeleton";
import * as React from "react";
import { type Claim, type Episode, type Show, transcriptLabel } from "../../adapters/podcasts";
import { pinFromColumns } from "../../lib/compare";
import { formatDate, today, useUrlParam } from "../../lib/url-state";
import PinButton from "../views/PinButton";
import SaveView from "../views/SaveView";
import DataTable from "../views/ViewTable";
import { ClaimDetail, ClaimList, ExternalLink, LiveProvenance, useApi } from "./shared";

const PAGE = 50;

const columns: DataColumn<Episode>[] = [
  {
    id: "title",
    header: "episode",
    value: (e) => e.title,
    hideable: false,
    sortable: false,
    minWidth: "18rem",
    cell: (e) => <span className="block max-w-[34rem] truncate font-medium text-foreground">{e.title}</span>,
  },
  {
    id: "publishedAt",
    header: "published",
    value: (e) => e.publishedAt,
    sortable: false,
    cell: (e) => <span className="tabular-nums text-muted-foreground">{formatDate(e.publishedAt) ?? "—"}</span>,
  },
  { id: "showName", header: "show", value: (e) => e.showName, sortable: false, className: "text-muted-foreground" },
  { id: "claimCount", header: "claims", value: (e) => e.claimCount, align: "right", sortable: false },
  { id: "peopleCount", header: "speakers", value: (e) => e.peopleCount, align: "right", sortable: false },
  {
    id: "transcriptKind",
    header: "transcript",
    value: (e) => transcriptLabel(e.transcriptKind),
    sortable: false,
    hidden: true,
    className: "text-muted-foreground",
  },
];

/** Episodes with published claims, newest first, paged on the server. */
export default function EpisodesView() {
  const [q, setQ] = useUrlParam("q");
  const [show, setShow] = useUrlParam("show");
  const [pageParam, setPageParam] = useUrlParam("page");
  const [episodeId, setEpisodeId] = useUrlParam("episode");
  const page = Math.max(0, Number(pageParam ?? 1) - 1) || 0;
  const [draft, setDraft] = React.useState(q ?? "");
  React.useEffect(() => setDraft(q ?? ""), [q]);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((draft.trim() || null) !== (q || null)) {
        setQ(draft.trim() || null);
        setPageParam(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [draft, q, setQ, setPageParam]);

  const params = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) });
  if (q) params.set("q", q);
  if (show) params.set("show", show);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const [state, retry] = useApi<{ sources: Episode[]; total: number; publishers: Show[] }>(
    mounted ? `episodes?${params}` : null,
  );
  const rows = state.status === "ready" ? state.value.data.sources : [];
  const total = state.status === "ready" ? state.value.data.total : 0;
  const [publishers, setPublishers] = React.useState<Show[]>([]);
  const pin = (e: Episode) =>
    pinFromColumns(
      "/podcasts/",
      e.id,
      e.title,
      e,
      columns,
      state.status === "ready" ? state.value.provenance : undefined,
      "episode",
      {},
      e.sourceUrl ?? undefined,
    );
  React.useEffect(() => {
    if (state.status === "ready" && state.value.data.publishers.length) setPublishers(state.value.data.publishers);
  }, [state]);

  return (
    <>
      <div className="mb-4">
        <FilterBar>
          <SaveView />
          <FilterSearch value={draft} onChange={setDraft} placeholder="Episode or show…" />
          <Select
            value={show ?? "all"}
            onValueChange={(v) => {
              setShow(v === "all" ? null : v);
              setPageParam(null);
            }}
          >
            <SelectTrigger size="sm" className="ui-case h-8 w-auto gap-1.5" aria-label="Show">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="ui-case">
                all shows
              </SelectItem>
              {publishers.map((p) => (
                <SelectItem key={p.slug} value={p.slug}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterBar>
      </div>
      <RecordLayout>
        <DataTable
          pin={pin}
          className="flex-1"
          label="Episodes"
          data={rows}
          columns={columns}
          getRowId={(e) => e.id}
          status={state.status}
          error="The Podcasts API did not answer."
          onRetry={retry}
          onRowClick={(e) => setEpisodeId(e.id)}
          selectedId={episodeId}
          pageSize={PAGE}
          manual={{ rowCount: total, page, onPageChange: (p) => setPageParam(p ? String(p + 1) : null) }}
          empty="No episodes with published claims match."
          toolbar={(view) => (
            <>
              <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
                {state.status === "ready" ? (
                  <>
                    <span className="text-foreground">{total.toLocaleString("en-US")}</span> episodes with published
                    claims
                  </>
                ) : (
                  "loading episodes…"
                )}
              </p>
              {state.status === "ready" && view.rows.length > 0 && (
                <ExportMenu
                  rows={view.rows}
                  columns={episodeExport}
                  filename={`podcast-episodes-page-${page + 1}-${today()}`}
                  meta={{ collection: "podcasts", ...state.value.provenance, page: page + 1 }}
                />
              )}
            </>
          )}
        />
        <RecordDetail
          open={!!episodeId}
          onOpenChange={(v) => !v && setEpisodeId(null)}
          title={rows.find((e) => e.id === episodeId)?.title ?? "episode"}
          subtitle={rows.find((e) => e.id === episodeId)?.showName}
          className="lg:w-[28rem]"
        >
          {episodeId && <EpisodeDetail id={episodeId} />}
        </RecordDetail>
      </RecordLayout>
    </>
  );
}

const episodeExport = [
  "id",
  "publishedAt",
  "showName",
  "title",
  "claimCount",
  "peopleCount",
  "transcriptKind",
  "sourceUrl",
].map((k) => ({ id: k, value: (e: Episode) => e[k as keyof Episode] }));

function EpisodeDetail({ id }: { id: string }) {
  const [state, retry] = useApi<{ source: Episode; claims: Claim[] }>(`episodes/${encodeURIComponent(id)}`);
  const [claimId, setClaimId] = React.useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: close the open claim when the record changes
  React.useEffect(() => setClaimId(null), [id]);
  if (state.status === "loading") return <Skeleton className="h-40 w-full" />;
  if (state.status === "error")
    return (
      <p className="text-sm">
        This episode did not load.{" "}
        <button type="button" className="underline underline-offset-4" onClick={retry}>
          Try again
        </button>
      </p>
    );
  const { source, claims } = state.value.data;
  const timed = claims.filter((c) => c.timestampS != null).length;
  if (claimId)
    return (
      <>
        <button
          type="button"
          className="ui-case self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setClaimId(null)}
        >
          ← all claims in this episode
        </button>
        <ClaimDetail id={claimId} />
      </>
    );
  return (
    <>
      <KeyValueList
        items={[
          { label: "show", value: source.showName },
          { label: "published", value: formatDate(source.publishedAt) },
          { label: "transcript", value: transcriptLabel(source.transcriptKind) },
          { label: "published claims", value: claims.length.toLocaleString("en-US") },
          { label: "timed claims", value: timed ? timed.toLocaleString("en-US") : "none (no caption timings)" },
        ]}
      />
      {source.sourceUrl && <ExternalLink href={source.sourceUrl}>episode source</ExternalLink>}
      <section>
        <h3 className="ui-case mb-2 text-xs font-medium text-muted-foreground">claims</h3>
        <ClaimList claims={claims} status="ready" onOpen={(c) => setClaimId(c.id)} />
      </section>
      <LiveProvenance info={state.value.provenance} page={source.sourceUrl ?? undefined} />
      <PinButton
        item={pinFromColumns(
          "/podcasts/",
          source.id,
          source.title,
          source,
          columns,
          state.value.provenance,
          "episode",
          {},
          source.sourceUrl ?? undefined,
        )}
      />
    </>
  );
}
