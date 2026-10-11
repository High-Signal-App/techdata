import { ExportMenu } from "@saas-maker/ui/blocks/export-menu";
import { ActiveFilters, FacetFilter, FilterBar, FilterSearch, useUrlFilters } from "@saas-maker/ui/blocks/filter-bar";
import { KeyValueList, Provenance, RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import { Button } from "@saas-maker/ui/components/button";
import type { DataColumn } from "@saas-maker/ui/components/data-table";
import type { FilterDef, FilterState } from "@saas-maker/ui/lib/filters";
import * as React from "react";
import { PH_META } from "../../adapters/ph/meta";
import { loadPhQuery, type PhSort, type Product } from "../../adapters/ph/query";
import { afterPhPaint, latestPhRead, type PhSummary, summaryPage } from "../../adapters/ph/summary";
import { pinFromColumns } from "../../lib/compare";
import { today, useUrlParam } from "../../lib/url-state";
import PinButton from "../views/PinButton";
import SaveView from "../views/SaveView";
import DataTable from "../views/ViewTable";

const defs: FilterDef<Product>[] = [
  { kind: "facet", id: "category", label: "category", value: (p) => p.categories },
  { kind: "facet", id: "website", label: "has website", value: (p) => (p.website_url ? "yes" : "no") },
];
function host(url: string | null) {
  try {
    return url ? new URL(url).host : "not recorded";
  } catch {
    return "not recorded";
  }
}
function link(url: string | null, label: string) {
  if (!url || !/^https?:\/\//i.test(url)) return "not recorded";
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
      {label}
    </a>
  );
}
const columns: DataColumn<Product>[] = [
  { id: "name", header: "name", value: (p) => p.name, hideable: false, minWidth: "12rem" },
  {
    id: "tagline",
    header: "tagline",
    value: (p) => p.tagline,
    cell: (p) => <span className="block max-w-96 truncate text-muted-foreground">{p.tagline ?? "not recorded"}</span>,
  },
  {
    id: "categories",
    header: "categories",
    value: (p) => p.categories.join(", "),
    cell: (p) => <span className="block max-w-64 truncate">{p.categories.join(", ") || "not recorded"}</span>,
  },
  { id: "website_url", header: "website host", value: (p) => host(p.website_url) },
];
const exportColumns = ["slug", "name", "tagline", "description", "website_url", "categories", "producthunt_url"].map(
  (id) => ({ id, value: (p: Product) => p[id as keyof Product] }),
);
type Result = {
  rows: Product[];
  total: number;
  categories: { value: string; count: number }[];
  websites: { value: string; count: number }[];
  detail: Product | null;
  provenance: PhSummary["provenance"] | Awaited<ReturnType<typeof loadPhQuery>>["provenance"];
};

export default function ProductsView({ summary }: { summary: PhSummary }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const [filters, setFilters] = useUrlFilters(defs);
  const [pageParam, setPage] = useUrlParam("page");
  const [sortParam, setSort] = useUrlParam("sort");
  const [slug, setSlug] = useUrlParam("product");
  const requestedPage = Number(pageParam ?? 1);
  const page = Number.isFinite(requestedPage) ? Math.max(0, Math.trunc(requestedPage) - 1) : 0;
  const [id, direction] = (sortParam ?? "name:asc").split(":");
  const sort: PhSort = { id, desc: direction === "desc" };
  const [state, setState] = React.useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<Result>({
    rows: summary.rows.slice(0, 50),
    total: summary.total,
    categories: summary.categories,
    websites: summary.websites,
    detail: null,
    provenance: summary.provenance,
  });
  const [query, setQuery] = React.useState<Awaited<ReturnType<typeof loadPhQuery>> | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const key = JSON.stringify({ q: filters.q, categories: filters.facets.category, website: filters.facets.website });
  React.useEffect(() => {
    void nonce; // Retry a failed engine load without changing the URL.
    let current = true;
    const cancel = afterPhPaint(() => {
      loadPhQuery()
        .then((engine) => {
          if (current) setQuery(engine);
        })
        .catch((e: unknown) => {
          if (current) {
            setError(e instanceof Error ? e.message : "Engine or Parquet file failed.");
            setState("error");
          }
        });
    });
    return () => {
      current = false;
      cancel();
    };
  }, [nonce]);
  React.useEffect(() => {
    if (!query) return;
    setState("loading");
    const filter = JSON.parse(key);
    const sorting = { id, desc: direction === "desc" };
    return latestPhRead(
      async () => {
        const unfiltered = !filter.q?.trim() && !filter.categories?.length && !filter.website?.length;
        const [rows, total, categories, websites, detail] = await Promise.all([
          query.rows(filter, sorting, page),
          unfiltered ? Promise.resolve(summary.total) : query.count(filter),
          unfiltered ? Promise.resolve(summary.categories) : query.facets(filter, "category"),
          unfiltered ? Promise.resolve(summary.websites) : query.facets(filter, "website"),
          slug ? query.record(slug) : Promise.resolve(null),
        ]);
        return { rows, total, categories, websites, detail, provenance: query.provenance };
      },
      (next) => {
        setResult(next);
        setState("ready");
        performance.mark("ph-query-ready");
      },
      (e) => {
        setError(e instanceof Error ? e.message : "Engine or Parquet file failed.");
        setState("error");
      },
    );
  }, [query, key, page, id, direction, slug, summary]);
  const preview = summaryPage(summary, JSON.parse(key), sort, page);
  const showingSummary = !query || state !== "ready";
  const visibleRows = showingSummary ? (preview ?? summary.rows.slice(0, 50)) : result.rows;
  const update = (next: FilterState) => {
    setFilters(next);
    setPage(null);
  };
  const facet = (name: string, values: string[]) =>
    update({ ...filters, facets: { ...filters.facets, [name]: values } });
  const detail = state === "ready" ? result?.detail : null;
  const provenance = showingSummary ? summary.provenance : result.provenance;
  const pin = (p: Product) =>
    pinFromColumns("/ph/", p.slug, p.name, p, columns, provenance, "product", {}, p.producthunt_url ?? undefined);
  return (
    <>
      <FilterBar>
        <SaveView />
        <FilterSearch
          value={filters.q ?? ""}
          onChange={(q) => update({ ...filters, q })}
          placeholder="Name, tagline or description…"
        />
        <FacetFilter
          label="category"
          options={showingSummary ? summary.categories : result.categories}
          selected={filters.facets.category ?? []}
          onChange={(v) => facet("category", v)}
        />
        <FacetFilter
          label="has website"
          options={showingSummary ? summary.websites : result.websites}
          selected={filters.facets.website ?? []}
          onChange={(v) => facet("website", v)}
        />
      </FilterBar>
      <ActiveFilters defs={defs} state={filters} onChange={update} className="my-3" />
      <p className="ph-engine-status my-3 text-sm text-muted-foreground" role="status">
        {state === "error" ? (
          <>
            Full catalog could not load: {error}{" "}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery(null);
                setState("loading");
                setNonce((n) => n + 1);
              }}
            >
              retry
            </Button>
          </>
        ) : showingSummary ? (
          <>
            Loading full catalog…{" "}
            {preview
              ? "You can browse the first 100 products by name."
              : "Your view is queued; showing the first 50 products by name until ready."}
          </>
        ) : (
          "Full catalog ready."
        )}
      </p>
      <RecordLayout>
        <DataTable
          pin={pin}
          className="flex-1"
          label="PH products"
          data={visibleRows}
          columns={columns}
          getRowId={(p) => p.slug}
          status="ready"
          error={`PH Catalog could not load: ${error}`}
          onRetry={() => setNonce((n) => n + 1)}
          selectedId={slug}
          onRowClick={(p) => setSlug(p.slug)}
          pageSize={50}
          sort={[sort]}
          onSortChange={(s) => {
            setSort(s[0] ? `${s[0].id}:${s[0].desc ? "desc" : "asc"}` : null);
            setPage(null);
          }}
          manual={{
            // Library pagination uses the runtime locale; render it only after hydration.
            rowCount: mounted ? (showingSummary ? summary.total : result.total) : visibleRows.length,
            page: showingSummary && !preview ? 0 : page,
            onPageChange: (p) => setPage(p ? String(p + 1) : null),
          }}
          empty="No products match these filters."
          toolbar={() => (
            <>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {showingSummary
                  ? `${summary.total.toLocaleString("en-US")} matching products`
                  : `${result.total.toLocaleString("en-US")} matching products`}
              </p>
              {state === "ready" && query ? (
                <PhExport key={`${key}:${id}:${direction}`} query={query} filters={JSON.parse(key)} sort={sort} />
              ) : (
                <Button variant="ghost" size="sm" disabled>
                  prepare export
                </Button>
              )}
            </>
          )}
        />
        <RecordDetail
          actions={detail && <PinButton item={pin(detail)} />}
          open={!!slug}
          onOpenChange={(open) => !open && setSlug(null)}
          title={detail?.name ?? "product"}
          subtitle={detail?.tagline ?? undefined}
          className="lg:w-[28rem]"
        >
          {state === "loading" ? (
            <p className="text-sm">Loading product…</p>
          ) : state === "error" ? (
            <p className="text-sm">Product could not load. {error}</p>
          ) : detail ? (
            <>
              <p className="text-sm leading-relaxed whitespace-pre-line">{detail.description || "not recorded"}</p>
              <KeyValueList
                align="start"
                items={[
                  { label: "slug", value: detail.slug },
                  { label: "categories", value: detail.categories.join(", ") || "not recorded" },
                  { label: "website", value: link(detail.website_url, host(detail.website_url)) },
                  { label: "Product Hunt", value: link(detail.producthunt_url, "public product page") },
                  { label: "release", value: link(PH_META.releaseUrl, `${PH_META.release} · ${PH_META.publishedAt}`) },
                  { label: "collector", value: PH_META.collector },
                  { label: "attribution", value: PH_META.attribution },
                  { label: "collected at", value: "not recorded" },
                ]}
              />
              <p className="text-sm text-muted-foreground">
                {PH_META.coverageLabel}. Not a ranking: the catalogue has no votes/dates.
              </p>
              {provenance && (
                <Provenance
                  info={{
                    source: provenance.source,
                    url: detail.producthunt_url ?? provenance.sourceUrl,
                    via: provenance.via,
                    viaUrl: provenance.viaUrl,
                    readAt: provenance.fetchedAt,
                    revision: provenance.revision,
                    note: provenance.note,
                  }}
                />
              )}
            </>
          ) : (
            <p className="text-sm">This slug is not in the loaded catalogue.</p>
          )}
        </RecordDetail>
      </RecordLayout>
    </>
  );
}

/** Export is expensive: read all filtered rows only on explicit request. */
function PhExport({
  query,
  filters,
  sort,
}: {
  query: Awaited<ReturnType<typeof loadPhQuery>>;
  filters: Parameters<typeof query.export>[0];
  sort: PhSort;
}) {
  const [exported, setExported] = React.useState<Awaited<ReturnType<typeof query.export>> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const active = React.useRef(true);
  React.useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  if (exported)
    return (
      <ExportMenu
        rows={exported.rows}
        columns={[
          ...exportColumns,
          { id: "source", value: () => exported.source },
          { id: "collectedAt", value: () => exported.collectedAt },
          { id: "fetchedAt", value: () => exported.provenance.fetchedAt },
          { id: "revision", value: () => PH_META.revision },
        ]}
        filename={`ph-products-${today()}`}
        meta={{ ...exported, rows: undefined }}
      />
    );
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const value = await query.export(filters, sort);
            if (active.current) setExported(value);
          } catch (e) {
            if (active.current) setError(e instanceof Error ? e.message : "Export failed.");
          } finally {
            if (active.current) setBusy(false);
          }
        }}
      >
        {busy ? "Preparing export…" : "prepare export"}
      </Button>
      {error && (
        <span role="status" className="text-sm">
          {error}
        </span>
      )}
    </>
  );
}
