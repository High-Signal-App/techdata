import { ExportMenu } from "@saas-maker/ui/blocks/export-menu";
import {
  ActiveFilters,
  FacetFilter,
  FilterBar,
  FilterSearch,
  RangeFilter,
  useUrlFilters,
} from "@saas-maker/ui/blocks/filter-bar";
import { KeyValueList, RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import { RecordDetailSkeleton } from "@saas-maker/ui/blocks/skeletons";
import type { DataColumn, DataTableView } from "@saas-maker/ui/components/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@saas-maker/ui/components/select";
import { SkeletonText } from "@saas-maker/ui/components/skeleton";
import type { ExportColumn } from "@saas-maker/ui/lib/export";
import {
  type FilterDef,
  type FilterState,
  facetCounts,
  filterRows,
  rangeBounds,
  readFilters,
} from "@saas-maker/ui/lib/filters";
import * as React from "react";
import {
  ATTRIBUTION,
  type Catalog,
  type Comment,
  type Envelope,
  type Post,
  type Snapshot,
  snapshotHref,
} from "../../adapters/reddit";
import type { Provenance } from "../../adapters/types";
import { pinFromColumns } from "../../lib/compare";
import { publicPostColumns } from "../../lib/public-reddit-view";
import type { CaptureMetadata } from "../../lib/reddit-initial";
import { useUrlParam } from "../../lib/url-state";
import PinButton from "../views/PinButton";
import SaveView from "../views/SaveView";
import DataTable from "../views/ViewTable";
import { CaptureProvenance, Freshness, ReadError, useApi, useSort } from "./shared";

const defs: FilterDef<Post>[] = [
  { kind: "facet", id: "label", label: "post label", value: (p) => p.flair || "not recorded" },
  { kind: "range", id: "score", label: "recorded score", value: (p) => p.score },
];
const noPosts: Post[] = [];
const postRowId = (post: Post) => post.id;
const searchPost = (post: Post) => `${post.title} ${post.body}`;
const columns: DataColumn<Post>[] = publicPostColumns.map((column) =>
  column.id === "title"
    ? {
        ...column,
        hideable: false,
        minWidth: "18rem",
        cell: (post: Post) => <span className="block max-w-[34rem] truncate font-medium">{post.title}</span>,
      }
    : column.id === "score" || column.id === "commentCount"
      ? { ...column, align: "right" }
      : column,
);
const postFields: (keyof Post)[] = [
  "id",
  "title",
  "body",
  "permalink",
  "createdUtc",
  "retrievedAt",
  "score",
  "upvoteRatio",
  "commentCount",
  "flair",
  "nsfw",
  "spoiler",
  "removalState",
];
const commentFields: (keyof Comment)[] = [
  "id",
  "postId",
  "parentId",
  "body",
  "createdUtc",
  "retrievedAt",
  "score",
  "depth",
  "isSubmitter",
  "removalState",
];
export function exportColumns<T extends Post | Comment>(fields: (keyof T)[], s: Snapshot): ExportColumn<T>[] {
  return [
    ...fields.map((id) => ({ id: String(id), value: (row: T) => row[id] })),
    ...Object.entries({
      subreddit: s.subreddit,
      date: s.date,
      revision: s.source.revision,
      capturedAt: s.capturedAt,
      source: "Reddit, via Reddit Insights capture runs",
      windowStart: s.window.start,
      windowEnd: s.window.end,
      coverageStatus: s.coverage.status,
    }).map(([id, value]) => ({ id, value: () => value })),
  ];
}
function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="h-8 w-auto max-w-full" aria-label={label}>
        <SelectValue placeholder={label}>{value || label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((v) => (
          <SelectItem value={v} key={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export default function PostsView({
  initialCatalog,
  initialMetadata,
  initialBounds,
  initialQuery = "",
}: {
  initialCatalog?: Envelope<Catalog>;
  initialMetadata?: Envelope<CaptureMetadata>;
  initialBounds?: { min: number; max: number } | null;
  initialQuery?: string;
}) {
  const params = new URLSearchParams(initialQuery);
  const [catalog, retryCatalog] = useApi<Catalog>("catalog", initialCatalog);
  const [subreddit, setSubreddit] = useUrlParam("subreddit", params.get("subreddit"));
  const [date, setDate] = useUrlParam("date", params.get("date"));
  const [version, setVersion] = useUrlParam("v", params.get("v"));
  const [postId, setPostId] = useUrlParam("post", params.get("post"));
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const entries =
    catalog.status === "ready"
      ? catalog.value.data.entries.filter((entry) => Date.parse(entry.expiresAt) > Date.now())
      : [];
  const community = subreddit ?? entries[0]?.subreddit;
  const dates = [...new Set(entries.filter((e) => e.subreddit === community).map((e) => e.date))].sort().reverse();
  const day = date ?? dates[0];
  const seed =
    initialMetadata &&
    initialMetadata.data.subreddit === community &&
    initialMetadata.data.date === day &&
    (!version || initialMetadata.data.source.revision.startsWith(version))
      ? initialMetadata
      : undefined;
  const servingVersion = version ?? seed?.data.source.revision.slice(0, 12);
  const [state, retry] = useApi<Snapshot>(
    mounted && community && day
      ? `snapshots/${day}/${encodeURIComponent(community)}${servingVersion ? `?v=${encodeURIComponent(servingVersion)}` : ""}`
      : null,
  );
  const [clientFilters, setFilters] = useUrlFilters(defs);
  const serverFilters = React.useMemo(() => readFilters(defs, initialQuery), [initialQuery]);
  const filterKey = JSON.stringify(mounted ? clientFilters : serverFilters);
  const filters = React.useMemo<FilterState>(() => JSON.parse(filterKey), [filterKey]);
  const sort = useSort("score", params.get("sort"));
  // Persist the resolved identity so a copied detail URL never drifts to another revision.
  React.useEffect(() => {
    if (
      state.status !== "ready" ||
      state.value.data.subreddit.toLowerCase() !== community?.toLowerCase() ||
      state.value.data.date !== day
    )
      return;
    if (!subreddit) setSubreddit(state.value.data.subreddit);
    if (!date) setDate(state.value.data.date);
    if (!version) setVersion(state.value.data.source.revision.slice(0, 12));
  }, [state, subreddit, date, version, setSubreddit, setDate, setVersion, community, day]);
  const snapshot = state.status === "ready" ? state.value.data : null;
  const all = snapshot?.posts ?? noPosts;
  const rows = React.useMemo(() => filterRows(all, defs, filters, { search: searchPost }), [all, filters]);
  const labels = React.useMemo(() => facetCounts(all, defs, filters, "label", { search: searchPost }), [all, filters]);
  const recordedBounds = React.useMemo(() => rangeBounds(all, (p) => p.score), [all]);
  const bounds = snapshot ? recordedBounds : seed ? initialBounds : null;
  const metadata = snapshot ?? (seed && Date.parse(seed.data.expiresAt) > Date.now() ? seed.data : null);
  React.useEffect(() => {
    if (state.status === "ready") performance.mark("reddit-query-ready");
  }, [state.status]);
  const post = all.find((p) => p.id === postId);
  const sourceInfo = state.status === "ready" ? state.value.provenance : undefined;
  const openPost = React.useCallback((post: Post) => setPostId(post.id), [setPostId]);
  const pin = React.useCallback(
    (p: Post) =>
      pinFromColumns(
        "/reddit/posts/",
        p.id,
        p.title,
        p,
        columns,
        sourceInfo,
        "post",
        snapshot
          ? { subreddit: snapshot.subreddit, date: snapshot.date, v: snapshot.source.revision.slice(0, 12) }
          : {},
        `https://www.reddit.com${p.permalink}`,
      ),
    [sourceInfo, snapshot],
  );
  const meta = React.useMemo(
    () =>
      snapshot && sourceInfo
        ? {
            collection: "reddit",
            ...sourceInfo,
            attribution: ATTRIBUTION,
            window: snapshot.window,
            coverage: snapshot.coverage,
            filters,
          }
        : undefined,
    [snapshot, sourceInfo, filters],
  );
  const toolbar = React.useCallback(
    (view: DataTableView<Post>) => (
      <>
        <span className="text-sm text-muted-foreground">{rows.length} threads</span>
        {snapshot && (
          <>
            <ExportMenu
              label="export posts"
              rows={view.rows}
              columns={exportColumns(postFields, snapshot)}
              filename={`reddit-${snapshot.subreddit}-${snapshot.date}-posts`}
              meta={meta}
            />
            <ExportMenu
              label="export comments"
              rows={snapshot.comments}
              columns={exportColumns(commentFields, snapshot)}
              filename={`reddit-${snapshot.subreddit}-${snapshot.date}-comments`}
              meta={{
                ...meta,
                filters: { subreddit: snapshot.subreddit, date: snapshot.date, v: snapshot.source.revision },
                scope: "all retained comments in the selected snapshot",
              }}
            />
          </>
        )}
      </>
    ),
    [rows.length, snapshot, meta],
  );
  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <SaveView />
        <Picker
          label="subreddit"
          value={community ?? ""}
          options={[...new Set([...(community ? [community] : []), ...entries.map((e) => e.subreddit)])].sort()}
          onChange={(v) => {
            setSubreddit(v);
            setDate(null);
            setVersion(null);
            setPostId(null);
          }}
        />
        <Picker
          label="collection date"
          value={day ?? ""}
          options={[...new Set([...(day ? [day] : []), ...dates])]}
          onChange={(v) => {
            setDate(v);
            setVersion(null);
            setPostId(null);
          }}
        />
        <FilterSearch
          value={filters.q ?? ""}
          onChange={(q) => setFilters({ ...filters, q })}
          placeholder="Search captured threads…"
        />
        <FacetFilter
          label="post label"
          options={labels}
          selected={filters.facets.label ?? []}
          onChange={(v) => setFilters({ ...filters, facets: { ...filters.facets, label: v } })}
        />
        <div className="min-h-8">
          {bounds && (
            <RangeFilter
              label="recorded score"
              bounds={bounds}
              step={1}
              value={filters.ranges.score}
              onChange={(v) => setFilters({ ...filters, ranges: { ...filters.ranges, score: v ?? {} } })}
            />
          )}
        </div>
      </FilterBar>
      <ActiveFilters defs={defs} state={filters} onChange={setFilters} />
      <div className="capture-metadata">
        {metadata ? (
          <>
            <Freshness snapshot={metadata} />
            <p className="text-sm text-muted-foreground">{metadata.coverage.note}</p>
          </>
        ) : state.status === "loading" &&
          catalog.status !== "error" &&
          (catalog.status === "loading" || !!community) ? (
          <SkeletonText lines={3} />
        ) : null}
      </div>
      <RecordLayout>
        <DataTable
          pin={pin}
          label="Captured threads"
          initialColumns={params.get("columns")}
          data={rows}
          columns={columns}
          getRowId={postRowId}
          status={!community || !day ? catalog.status : state.status}
          {...sort}
          onRetry={!community || !day ? retryCatalog : retry}
          error={
            catalog.status === "error" ? (
              <ReadError error={catalog.error} retry={retryCatalog} />
            ) : state.status === "error" ? (
              <ReadError error={state.error} retry={retry} />
            ) : undefined
          }
          onRowClick={openPost}
          selectedId={postId}
          empty="No captured threads match."
          toolbar={toolbar}
        />
        <RecordDetail
          actions={post && <PinButton item={pin(post)} />}
          open={!!postId}
          onOpenChange={(v) => !v && setPostId(null)}
          title={post?.title ?? "thread"}
          subtitle={community ? `r/${community}` : undefined}
        >
          {state.status === "loading" && <RecordDetailSkeleton className="border-0 rounded-none max-w-none" />}
          {state.status === "error" && <ReadError error={state.error} retry={retry} />}
          {snapshot && post && state.status === "ready" && (
            <PostDetail post={post} snapshot={snapshot} provenance={state.value.provenance} />
          )}
          {snapshot && postId && !post && <p>This post is not present in this captured revision.</p>}
        </RecordDetail>
      </RecordLayout>
      {state.status === "ready" && <CaptureProvenance info={state.value.provenance} />}
    </div>
  );
}
function PostDetail({ post, snapshot, provenance }: { post: Post; snapshot: Snapshot; provenance: Provenance }) {
  const comments = snapshot.comments.filter((c) => c.postId === post.id);
  return (
    <>
      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{post.body || "body not recorded"}</p>
      <KeyValueList
        items={[
          { label: "recorded score", value: post.score },
          { label: "reported replies", value: post.commentCount },
          { label: "retained comments", value: comments.length },
          { label: "post label", value: post.flair ?? "not recorded" },
          { label: "created (UTC)", value: new Date(post.createdUtc * 1000).toISOString() },
          { label: "removal state", value: post.removalState ?? "not recorded" },
          { label: "attribution", value: "Reddit; authors omitted by the capture API" },
        ]}
      />
      <a
        href={`https://www.reddit.com${post.permalink}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm underline underline-offset-4"
      >
        Reddit permalink
      </a>
      <a href={snapshotHref(snapshot, post.id)} className="text-sm underline underline-offset-4">
        link to this captured revision
      </a>
      <Freshness snapshot={snapshot} />
      <section>
        <h3 className="ui-case text-xs font-medium text-muted-foreground">retained comments</h3>
        <p className="my-2 text-sm text-muted-foreground">{snapshot.coverage.note}</p>
        <ul className="flex flex-col gap-4">
          {comments.map((c) => (
            <li key={c.id} className="border-l border-border pl-3 text-sm">
              <p className="leading-relaxed whitespace-pre-wrap break-words">{c.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                recorded score {c.score} · depth {c.depth} · parent {c.parentId} ·{" "}
                {new Date(c.createdUtc * 1000).toISOString()}
              </p>
            </li>
          ))}
        </ul>
        {!comments.length && <p className="text-sm">No retained comments in this snapshot.</p>}
      </section>
      <CaptureProvenance info={provenance} />
    </>
  );
}
