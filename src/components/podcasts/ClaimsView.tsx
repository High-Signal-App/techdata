import { ExportMenu } from "@saas-maker/ui/blocks/export-menu";
import { DateRangeFilter, FilterBar, FilterSearch } from "@saas-maker/ui/blocks/filter-bar";
import { RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import { Button } from "@saas-maker/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@saas-maker/ui/components/select";
import { XIcon } from "lucide-react";
import * as React from "react";
import { CLAIM_TYPES, type Claim, type Envelope } from "../../adapters/podcasts";
import { claimColumns, pinClaim } from "../../lib/podcast-pins";
import { today, useUrlParam } from "../../lib/url-state";
import SaveView from "../views/SaveView";
import DataTable from "../views/ViewTable";
import { ClaimDetail, ClaimList, claimExportColumns, LiveProvenance, useApi } from "./shared";

/**
 * Claim search over the public API's full-text index. The API returns the
 * newest 50 matches, so this is a search, not a full listing.
 */
export default function ClaimsView({ initial }: { initial?: Envelope<{ claims: Claim[]; evidence?: string }> }) {
  const [layout, setLayout] = useUrlParam("view");
  const [sortParam, setSort] = useUrlParam("sort");
  const [sortId, sortDirection] = (sortParam ?? "").split(":");
  const [q, setQ] = useUrlParam("q");
  const [type, setType] = useUrlParam("type");
  const [person, setPerson] = useUrlParam("person");
  const [from, setFrom] = useUrlParam("from");
  const [to, setTo] = useUrlParam("to");
  const [claimId, setClaimId] = useUrlParam("claim");
  const [draft, setDraft] = React.useState(q ?? "");
  React.useEffect(() => setDraft(q ?? ""), [q]);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((draft.trim() || null) !== (q || null)) setQ(draft.trim() || null);
    }, 300);
    return () => clearTimeout(t);
  }, [draft, q, setQ]);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type) params.set("type", type);
  if (person) params.set("person", person);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const filtered = !!(q || type || person || from || to);
  const [state, retry] = useApi<{ claims: Claim[]; evidence?: string }>(
    mounted ? `claims?${params}` : null,
    filtered ? undefined : initial,
  );
  const claims = state.status === "ready" ? state.value.data.claims : [];

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <FilterBar>
          <SaveView />
          <FilterSearch value={draft} onChange={setDraft} placeholder="Words in the claim…" />
          <Select value={type ?? "any"} onValueChange={(v) => setType(v === "any" ? null : v)}>
            <SelectTrigger size="sm" className="ui-case h-8 w-auto gap-1.5" aria-label="Claim type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any" className="ui-case">
                any type
              </SelectItem>
              {CLAIM_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="ui-case">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeFilter
            label="said on"
            value={from || to ? { from: from ?? undefined, to: to ?? undefined } : undefined}
            max={today()}
            onChange={(v) => {
              setFrom(v?.from ?? null);
              setTo(v?.to ?? null);
            }}
          />
          {person && (
            <span className="inline-flex h-8 items-center gap-1 rounded-full bg-secondary pl-3 pr-1 text-sm">
              <span className="ui-case text-xs text-muted-foreground">speaker</span> {person}
              <button
                type="button"
                onClick={() => setPerson(null)}
                aria-label="Remove speaker filter"
                className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            </span>
          )}
          {filtered && (
            <Button
              variant="link"
              size="xs"
              className="text-muted-foreground"
              onClick={() => {
                setDraft("");
                for (const set of [setQ, setType, setPerson, setFrom, setTo]) set(null);
              }}
            >
              clear all
            </Button>
          )}
        </FilterBar>
      </div>

      <RecordLayout>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex min-h-[4.5rem] flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="ghost" onClick={() => setLayout(layout === "table" ? null : "table")}>
              {layout === "table" ? "quote view" : "table & pin"}
            </Button>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {state.status === "ready"
                ? claims.length
                  ? `${filtered ? "newest" : "latest"} ${claims.length} published claims${filtered ? " that match" : ""}`
                  : "no matching claims"
                : state.status === "loading"
                  ? "searching…"
                  : ""}
            </p>
            {claims.length > 0 && (
              <ExportMenu
                rows={claims}
                columns={claimExportColumns}
                filename={`podcast-claims-${today()}`}
                meta={state.status === "ready" ? { collection: "podcasts", ...state.value.provenance } : undefined}
              />
            )}
          </div>
          {layout === "table" ? (
            <DataTable
              label="claims"
              data={claims}
              columns={claimColumns}
              getRowId={(c) => c.id}
              sort={sortId ? [{ id: sortId, desc: sortDirection === "desc" }] : []}
              onSortChange={(sort) => setSort(sort[0] ? `${sort[0].id}:${sort[0].desc ? "desc" : "asc"}` : null)}
              pin={(c) => pinClaim(c, state.status === "ready" ? state.value.provenance : undefined)}
              status={state.status}
              onRowClick={(c) => setClaimId(c.id)}
              selectedId={claimId}
              onRetry={retry}
              empty="no published claims match"
            />
          ) : (
            <ClaimList
              claims={claims}
              status={state.status}
              selectedId={claimId}
              onOpen={(c) => setClaimId(c.id)}
              onRetry={retry}
              empty="The index has no published claim with these words. Try fewer or different words."
            />
          )}
          {state.status === "ready" && <LiveProvenance info={state.value.provenance} />}
        </div>
        <RecordDetail
          open={!!claimId}
          onOpenChange={(v) => !v && setClaimId(null)}
          title="claim"
          subtitle={claims.find((c) => c.id === claimId)?.episodeTitle}
        >
          {claimId && <ClaimDetail id={claimId} />}
        </RecordDetail>
      </RecordLayout>
    </>
  );
}
