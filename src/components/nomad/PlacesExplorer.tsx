import { ExportMenu } from "@saas-maker/ui/blocks/export-menu";
import {
  ActiveFilters,
  FacetFilter,
  FilterBar,
  FilterSearch,
  RangeFilter,
  useUrlFilters,
} from "@saas-maker/ui/blocks/filter-bar";
import { RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import { Button } from "@saas-maker/ui/components/button";
import type { DataColumn, DataSort } from "@saas-maker/ui/components/data-table";
import { Pagination } from "@saas-maker/ui/components/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@saas-maker/ui/components/select";
import { ToggleGroup, ToggleGroupItem } from "@saas-maker/ui/components/toggle-group";
import {
  emptyFilters,
  type FilterDef,
  type FilterState,
  facetCounts,
  filterRows,
  rangeBounds,
} from "@saas-maker/ui/lib/filters";
import { LayoutGridIcon, ListIcon, SlidersHorizontalIcon } from "lucide-react";
import * as React from "react";
import { NOMAD_SNAPSHOT, nomadProvenance } from "../../adapters/nomad/meta";
import { format, median, type ProfileId, profiles } from "../../adapters/nomad/model.js";
import {
  costOf,
  type Dataset,
  DEFAULT_SORT,
  explorable,
  exportColumns,
  fromAtlasQuery,
  isAtlasQuery,
  isProfile,
  LIFESTYLE_FILTERS,
  type Place,
  type PlaceSort,
  PRESETS,
  parseSort,
  placeFilters,
  placeSearchText,
  SORT_OPTIONS,
  sortPlaces,
  sourceUrl,
  unusualCost,
  WEATHER_FILTERS,
  writeSort,
} from "../../adapters/nomad/places";
import type { PlacesSummary } from "../../adapters/nomad/summary";
import { pinFromColumns } from "../../lib/compare";
import { usePins } from "../../lib/local-lists";
import { today, useUrlParam } from "../../lib/url-state";
import PinButton from "../views/PinButton";
import SaveView from "../views/SaveView";
import DataTable from "../views/ViewTable";
import { PlaceDetail } from "./PlaceDetail";
import { CompareToggle, MAX_COMPARE, parseCompare, ShortlistBar } from "./shortlist";

// Old Nomad Atlas share links (?budget=1500&internet=25…) become techdata
// filters before anything reads the URL.
if (typeof window !== "undefined") {
  const params = new URLSearchParams(location.search);
  if (isAtlasQuery(params)) {
    const qs = fromAtlasQuery(params).toString();
    history.replaceState(history.state, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
  }
}

const usd = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
const s1 = (n: number | null) => (n == null ? "—" : n.toFixed(1));
const PAGE = 48;
const LIMIT_NOTICE = `Compare up to ${MAX_COMPARE} places. Remove one to add another.`;
const MORE_IDS = new Set<string>([...LIFESTYLE_FILTERS, ...WEATHER_FILTERS]);

function columnsFor(profile: ProfileId): DataColumn<Place>[] {
  return [
    {
      id: "name",
      header: "place",
      value: (p) => p.name,
      hideable: false,
      sortDescFirst: false,
      minWidth: "11rem",
      cell: (p) => <span className="font-medium text-foreground">{p.name}</span>,
    },
    {
      id: "country",
      header: "country",
      value: (p) => p.country,
      sortDescFirst: false,
      minWidth: "9rem",
      className: "text-muted-foreground",
    },
    { id: "region", header: "region", value: (p) => p.region, hidden: true, className: "text-muted-foreground" },
    {
      id: "cost",
      header: `${profiles[profile].toLowerCase()} / mo`,
      value: (p) => costOf(p, profile),
      align: "right",
      sortDescFirst: false,
      cell: (p) => {
        const v = costOf(p, profile);
        return (
          <span title={unusualCost(v) ? "Unusual source estimate" : undefined}>
            {usd(v)}
            {unusualCost(v) && <span className="ml-1 text-muted-foreground">*</span>}
          </span>
        );
      },
    },
    {
      id: "rent_1br_center_usd_per_month",
      header: "1br rent",
      value: (p) => p.rent_1br_center_usd_per_month,
      align: "right",
      sortDescFirst: false,
      hidden: true,
      cell: (p) => usd(p.rent_1br_center_usd_per_month),
    },
    {
      id: "coworking_usd_per_month",
      header: "coworking",
      value: (p) => p.coworking_usd_per_month,
      align: "right",
      sortDescFirst: false,
      hidden: true,
      cell: (p) => usd(p.coworking_usd_per_month),
    },
    { id: "internet_mbps", header: "mbps", value: (p) => p.internet_mbps, align: "right" },
    {
      id: "safety_score_0_to_5",
      header: "safety",
      value: (p) => p.safety_score_0_to_5,
      align: "right",
      cell: (p) => s1(p.safety_score_0_to_5),
    },
    {
      id: "walkability_score_0_to_5",
      header: "walkable",
      value: (p) => p.walkability_score_0_to_5,
      align: "right",
      cell: (p) => s1(p.walkability_score_0_to_5),
    },
    {
      id: "healthcare_score_0_to_5",
      header: "healthcare",
      value: (p) => p.healthcare_score_0_to_5,
      align: "right",
      hidden: true,
      cell: (p) => s1(p.healthcare_score_0_to_5),
    },
    {
      id: "nightlife_score_0_to_5",
      header: "nightlife",
      value: (p) => p.nightlife_score_0_to_5,
      align: "right",
      hidden: true,
      cell: (p) => s1(p.nightlife_score_0_to_5),
    },
    {
      id: "air_quality_now",
      header: "aqi",
      value: (p) => p.air_quality_now,
      align: "right",
      sortDescFirst: false,
      hidden: true,
    },
    {
      id: "overall_score",
      header: "overall",
      value: (p) => p.overall_score,
      align: "right",
      cell: (p) => <span className="text-foreground">{s1(p.overall_score)}</span>,
    },
    { id: "population", header: "population", value: (p) => p.population, align: "right", hidden: true },
  ];
}

function omit<V>(rec: Record<string, V>, key: string): Record<string, V> {
  const { [key]: _drop, ...rest } = rec;
  return rest;
}

export default function PlacesExplorer({ initial }: { initial: PlacesSummary }) {
  const [all, setAll] = React.useState<Place[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const load = React.useCallback(() => {
    setFailed(false);
    fetch(NOMAD_SNAPSHOT.file)
      .then((r) => (r.ok ? (r.json() as Promise<Dataset>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!Array.isArray(d.cities) || !d.cities.length) throw new Error("empty");
        setAll(explorable(d.cities));
      })
      .catch(() => setFailed(true));
  }, []);
  React.useEffect(load, [load]);

  const places = all ?? initial.rows;
  const [profileParam, setProfileParam] = useUrlParam("profile");
  const profile: ProfileId = isProfile(profileParam) ? profileParam : "nomad";
  const defs = React.useMemo(() => placeFilters(profile), [profile]);
  const [filters, setFilters] = useUrlFilters(defs);
  const [sortParam, setSortParam] = useUrlParam("sort");
  const sort: PlaceSort = parseSort(sortParam);
  const [viewParam, setViewParam] = useUrlParam("view");
  // Phones default to cards (the table scrolls sideways there); desktop to the table.
  const view = viewParam === "cards" || viewParam === "table" ? viewParam : "auto";
  const [openSlug, setOpenSlug] = useUrlParam("place");
  const [compareParam, setCompareParam] = useUrlParam("compare");
  const shortlist = React.useMemo(() => parseCompare(compareParam), [compareParam]);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [cardPage, setCardPage] = React.useState(0);

  const rows = React.useMemo(
    () => sortPlaces(filterRows(places, defs, filters, { search: placeSearchText }), sort, profile),
    [places, defs, filters, sort, profile],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: back to the first page whenever the result set changes
  React.useEffect(() => setCardPage(0), [rows]);

  const bounds = React.useMemo(() => {
    if (!all) return initial.bounds;
    const out: Record<string, { min: number; max: number } | null> = {};
    for (const d of defs) if (d.kind === "range") out[d.id] = rangeBounds(places, d.value);
    return out;
  }, [places, defs, all, initial.bounds]);
  const bySlug = React.useMemo(() => new Map(places.map((p) => [p.slug, p])), [places]);
  const open = openSlug ? bySlug.get(openSlug) : undefined;
  const moreActive = [...MORE_IDS].filter((id) => filters.ranges[id]).length;
  React.useEffect(() => {
    if (moreActive) setMoreOpen(true);
  }, [moreActive]);

  const toggleCompare = React.useCallback(
    (slug: string) => {
      setNotice(null);
      if (shortlist.includes(slug)) return setCompareParam(shortlist.filter((s) => s !== slug).join(",") || null);
      if (shortlist.length >= MAX_COMPARE) return setNotice(LIMIT_NOTICE);
      setCompareParam([...shortlist, slug].join(","));
    },
    [shortlist, setCompareParam],
  );
  const columns = React.useMemo(() => columnsFor(profile), [profile]);
  const pins = usePins();
  const pin = (p: Place) =>
    pinFromColumns(
      "/nomad/",
      p.slug,
      p.name,
      p,
      [...columns, { id: "profile", header: "cost profile", value: () => profile }],
      nomadProvenance,
      "place",
      { profile },
      sourceUrl(p),
    );

  const setSort = (s: PlaceSort) => setSortParam(s.id === DEFAULT_SORT.id && s.desc ? null : writeSort(s));
  const tableSort: DataSort = [sort];
  const facet = (id: string) => facetCounts(places, defs, filters, id, { search: placeSearchText });
  const activePreset = PRESETS.find((p) => sameFilters(p.apply(), filters))?.id ?? (isEmpty(filters) ? "all" : null);
  const countries = all ? new Set(rows.map((p) => p.country)).size : initial.countries;
  const costMedian = all ? median(rows.map((p) => costOf(p, profile))) : initial.costMedian;
  const netMedian = all ? median(rows.map((p) => p.internet_mbps)) : initial.netMedian;

  const filterControl = (d: FilterDef<Place>) => {
    if (d.kind === "facet")
      return (
        <FacetFilter
          key={d.id}
          label={d.label}
          options={all ? facet(d.id) : (initial.facets[d.id] ?? [])}
          selected={filters.facets[d.id] ?? []}
          onChange={(v) => setFilters((s) => ({ ...s, facets: { ...s.facets, [d.id]: v } }))}
        />
      );
    if (d.kind === "range" && bounds[d.id])
      return (
        <RangeFilter
          key={d.id}
          label={d.label}
          bounds={bounds[d.id] as { min: number; max: number }}
          value={filters.ranges[d.id]}
          format={d.format}
          step={d.step}
          onChange={(v) => setFilters((s) => ({ ...s, ranges: v ? { ...s.ranges, [d.id]: v } : omit(s.ranges, d.id) }))}
        />
      );
    return null;
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        {shortlist.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              pins.update((items) => [
                ...items,
                ...shortlist.flatMap((slug) => {
                  const p = bySlug.get(slug);
                  const item = p ? pin(p) : null;
                  return item ? [item] : [];
                }),
              ]);
            }}
          >
            pin selected to tray
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="ui-case text-xs text-muted-foreground">cost profile</span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={profile}
              onValueChange={(v) => v && setProfileParam(v === "nomad" ? null : v)}
              aria-label="Cost profile"
            >
              {(Object.keys(profiles) as ProfileId[]).map((p) => (
                <ToggleGroupItem key={p} value={p} className="ui-case px-2.5">
                  {profiles[p].toLowerCase()}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <fieldset className="m-0 flex flex-wrap items-center gap-1 border-0 p-0">
            <legend className="sr-only">Quick filters</legend>
            <Button
              variant="ghost"
              size="xs"
              aria-pressed={activePreset === "all"}
              className="aria-pressed:bg-secondary aria-pressed:text-foreground text-muted-foreground"
              onClick={() => setFilters(emptyFilters())}
            >
              all places
            </Button>
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                variant="ghost"
                size="xs"
                aria-pressed={activePreset === p.id}
                className="aria-pressed:bg-secondary aria-pressed:text-foreground text-muted-foreground"
                onClick={() => setFilters(p.apply())}
              >
                {p.label}
              </Button>
            ))}
          </fieldset>
        </div>

        <FilterBar>
          <SaveView />
          <FilterSearch
            value={filters.q ?? ""}
            onChange={(q) => setFilters((s) => ({ ...s, q: q || undefined }))}
            placeholder="City or country…"
          />
          {defs.filter((d) => !MORE_IDS.has(d.id)).map(filterControl)}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            aria-expanded={moreOpen}
            aria-controls="more-filters"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <SlidersHorizontalIcon />
            {moreOpen ? "fewer filters" : "more filters"}
            {moreActive > 0 && <span className="tabular-nums text-foreground">{moreActive}</span>}
          </Button>
        </FilterBar>
        {moreOpen && (
          <div id="more-filters" className="flex flex-col gap-2">
            <FilterBar>
              <span className="ui-case w-full text-xs text-muted-foreground sm:w-auto">lifestyle & inclusion</span>
              {defs.filter((d) => (LIFESTYLE_FILTERS as readonly string[]).includes(d.id)).map(filterControl)}
            </FilterBar>
            <FilterBar>
              <span className="ui-case w-full text-xs text-muted-foreground sm:w-auto">weather at collection</span>
              {defs.filter((d) => (WEATHER_FILTERS as readonly string[]).includes(d.id)).map(filterControl)}
            </FilterBar>
          </div>
        )}
        <ActiveFilters defs={defs} state={filters} onChange={setFilters} />
      </div>

      {rows.length > 0 && (
        <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <Stat
            label={`median ${profiles[profile].toLowerCase()} cost`}
            value={`${format(costMedian, "money")} / mo`}
          />
          <Stat label="median internet" value={format(netMedian, "speed")} />
          <Stat label="countries & territories" value={countries.toLocaleString("en-US")} />
        </dl>
      )}

      <RecordLayout>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {view !== "cards" && (
            <div className={view === "auto" ? "hidden sm:block" : undefined}>
              <DataTable
                label="Places"
                data={rows}
                columns={columns}
                getRowId={(p) => p.slug}
                status={failed ? "error" : "ready"}
                error="The places snapshot did not load."
                onRetry={load}
                onRowClick={(p) => setOpenSlug(p.slug)}
                selectedId={openSlug}
                selection={{
                  selected: shortlist,
                  onChange: (ids) => {
                    setNotice(null);
                    setCompareParam(ids.join(",") || null);
                  },
                  max: MAX_COMPARE,
                  onLimit: () => setNotice(LIMIT_NOTICE),
                  rowLabel: (p) => p.name,
                }}
                sort={tableSort}
                onSortChange={(s) => setSort(s[0] ?? DEFAULT_SORT)}
                empty={<EmptyState onReset={() => setFilters(emptyFilters())} />}
                toolbar={(v) => (
                  <Toolbar
                    count={all ? v.rows.length : initial.total}
                    total={all ? places.length : initial.total}
                    loaded={true}
                    exportReady={!!all}
                    view="table"
                    setView={setViewParam}
                    sort={sort}
                    setSort={setSort}
                    rows={v.rows}
                    profile={profile}
                  />
                )}
              />
            </div>
          )}
          {view !== "table" && (
            <div className={view === "auto" ? "sm:hidden" : undefined}>
              <div className="flex min-h-8 flex-wrap items-center gap-2">
                <Toolbar
                  count={all ? rows.length : initial.total}
                  total={all ? places.length : initial.total}
                  loaded={true}
                  exportReady={!!all}
                  view="cards"
                  setView={setViewParam}
                  sort={sort}
                  setSort={setSort}
                  rows={rows}
                  profile={profile}
                />
              </div>
              {failed ? (
                <div className="rounded-lg border border-border px-4 py-16 text-center text-sm">
                  The places snapshot did not load.{" "}
                  <Button variant="outline" size="sm" onClick={load}>
                    try again
                  </Button>
                </div>
              ) : rows.length === 0 && all ? (
                <div className="rounded-lg border border-border px-4 py-16 text-center text-sm text-muted-foreground">
                  <EmptyState onReset={() => setFilters(emptyFilters())} />
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {rows.slice(cardPage * PAGE, cardPage * PAGE + PAGE).map((p) => (
                    <PlaceCard
                      key={p.slug}
                      place={p}
                      profile={profile}
                      selected={openSlug === p.slug}
                      compared={shortlist.includes(p.slug)}
                      onOpen={() => setOpenSlug(p.slug)}
                      onToggle={toggleCompare}
                    />
                  ))}
                </ul>
              )}
              {(all ? rows.length : initial.total) > PAGE && (
                <Pagination
                  page={cardPage}
                  pageCount={Math.ceil((all ? rows.length : initial.total) / PAGE)}
                  rowCount={all ? rows.length : initial.total}
                  pageSize={PAGE}
                  onPageChange={(n) => {
                    setCardPage(n);
                    scrollTo({ top: 0 });
                  }}
                />
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            * Unusual source estimate (under $100 or over $30,000), kept as published. Missing measurements are excluded
            only when you filter on them.
          </p>
        </div>

        <RecordDetail
          open={!!open}
          onOpenChange={(v) => !v && setOpenSlug(null)}
          title={open?.name ?? ""}
          subtitle={open ? `${open.country} · ${open.region}` : undefined}
          actions={
            open && (
              <>
                <PinButton item={pin(open)} />
                <Button
                  variant={shortlist.includes(open.slug) ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => toggleCompare(open.slug)}
                >
                  {shortlist.includes(open.slug) ? "remove from compare" : "add to compare"}
                </Button>
              </>
            )
          }
        >
          {open && <PlaceDetail place={open} />}
        </RecordDetail>
      </RecordLayout>

      <ShortlistBar
        places={shortlist.map((s) => bySlug.get(s)).filter((p): p is Place => !!p)}
        notice={notice}
        onClear={() => {
          setNotice(null);
          setCompareParam(null);
        }}
        profile={profile}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="ui-case text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <span className="flex flex-col items-center gap-3">
      No places match these filters.
      <Button variant="outline" size="sm" onClick={onReset}>
        clear filters
      </Button>
    </span>
  );
}

function Toolbar({
  count,
  total,
  loaded,
  exportReady,
  view,
  setView,
  sort,
  setSort,
  rows,
  profile,
}: {
  count: number;
  total: number;
  loaded: boolean;
  exportReady: boolean;
  view: "table" | "cards";
  setView: (v: "table" | "cards") => void;
  sort: PlaceSort;
  setSort: (s: PlaceSort) => void;
  rows: Place[];
  profile: ProfileId;
}) {
  const sortValue = SORT_OPTIONS.find((o) => o.id === sort.id && o.desc === sort.desc)?.id;
  return (
    <>
      <p className="mr-auto text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {loaded ? (
          <>
            <span className="text-foreground">{count.toLocaleString("en-US")}</span> of {total.toLocaleString("en-US")}{" "}
            places
          </>
        ) : (
          "loading places…"
        )}
      </p>
      <Select
        value={sortValue ?? ""}
        onValueChange={(id) => {
          const o = SORT_OPTIONS.find((x) => x.id === id);
          if (o) setSort({ id: o.id, desc: o.desc });
        }}
      >
        <SelectTrigger size="sm" className="ui-case h-8 w-auto gap-1.5 text-muted-foreground" aria-label="Sort places">
          <SelectValue>{SORT_OPTIONS.find((o) => o.id === sortValue)?.label ?? "custom order"}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.id} value={o.id} className="ui-case">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={view}
        onValueChange={(v) => v && setView(v as "table" | "cards")}
        aria-label="Layout"
      >
        <ToggleGroupItem value="table" aria-label="Table">
          <ListIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="cards" aria-label="Cards">
          <LayoutGridIcon />
        </ToggleGroupItem>
      </ToggleGroup>
      <ExportMenu
        rows={exportReady ? rows : []}
        columns={exportColumns}
        filename={`nomad-atlas-${rows.length}-places-${today()}`}
        meta={{
          collection: "nomad",
          ...nomadProvenance,
          profile,
          filters: typeof location === "undefined" ? null : location.search || null,
        }}
      />
    </>
  );
}

function PlaceCard({
  place: p,
  profile,
  selected,
  compared,
  onOpen,
  onToggle,
}: {
  place: Place;
  profile: ProfileId;
  selected: boolean;
  compared: boolean;
  onOpen: () => void;
  onToggle: (slug: string) => void;
}) {
  const cost = costOf(p, profile);
  return (
    <li
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 data-[selected=true]:border-ring"
      data-selected={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left outline-none focus-visible:underline">
          <span className="block truncate font-medium text-foreground">{p.name}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {p.country} · {p.region}
          </span>
        </button>
        <span className="shrink-0 font-mono text-sm tabular-nums" title="Overall score out of 5">
          {s1(p.overall_score)}
        </span>
      </div>
      <div>
        <p className="text-xl font-medium tabular-nums">
          {usd(cost)}
          <span className="text-sm font-normal text-muted-foreground"> / mo</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {profiles[profile].toLowerCase()} estimate{unusualCost(cost) ? " · unusual source estimate" : ""}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <MiniStat label="internet" value={p.internet_mbps == null ? "—" : `${p.internet_mbps} Mbps`} />
        <MiniStat label="safety" value={s1(p.safety_score_0_to_5)} />
        <MiniStat label="walkable" value={s1(p.walkability_score_0_to_5)} />
      </dl>
      <div className="flex items-center justify-between gap-2">
        <CompareToggle place={p} selected={compared} onToggle={onToggle} />
        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={onOpen}>
          details
        </Button>
      </div>
    </li>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="ui-case text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function isEmpty(s: FilterState) {
  return !s.q && !Object.values(s.facets).some((v) => v.length) && !Object.keys(s.ranges).length;
}
function sameFilters(a: FilterState, b: FilterState) {
  const norm = (s: FilterState) =>
    JSON.stringify({
      q: s.q ?? "",
      f: Object.entries(s.facets).filter(([, v]) => v.length),
      r: Object.entries(s.ranges),
    });
  return norm(a) === norm(b);
}
