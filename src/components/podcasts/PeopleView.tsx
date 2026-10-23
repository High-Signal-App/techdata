import { ExportMenu } from "@saas-maker/ui/blocks/export-menu";
import { FilterBar, FilterSearch } from "@saas-maker/ui/blocks/filter-bar";
import { KeyValueList, RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import { RecordDetailSkeleton } from "@saas-maker/ui/blocks/skeletons";
import { Button } from "@saas-maker/ui/components/button";
import type { DataColumn } from "@saas-maker/ui/components/data-table";
import { ErrorState } from "@saas-maker/ui/components/error-state";
import * as React from "react";
import { type Claim, type Envelope, type Person, PODCASTS_SITE } from "../../adapters/podcasts";
import { pinFromColumns } from "../../lib/compare";
import { today, useUrlParam } from "../../lib/url-state";
import PinButton from "../views/PinButton";
import SaveView from "../views/SaveView";
import DataTable from "../views/ViewTable";
import { ClaimDetail, ClaimList, ExternalLink, LiveProvenance, useApi } from "./shared";

const PAGE = 50;

const columns: DataColumn<Person>[] = [
  {
    id: "name",
    header: "person",
    value: (p) => p.name,
    hideable: false,
    sortable: false,
    minWidth: "12rem",
    cell: (p) => <span className="font-medium text-foreground">{p.name}</span>,
  },
  {
    id: "role",
    header: "role",
    value: (p) => [p.title, p.org].filter(Boolean).join(", "),
    sortable: false,
    className: "text-muted-foreground",
  },
  { id: "claimCount", header: "claims", value: (p) => p.claimCount, align: "right", sortable: false },
  { id: "sourceCount", header: "episodes", value: (p) => p.sourceCount, align: "right", sortable: false },
];

/** Verified speakers, most claims first. Unverified speakers are never listed as people. */
export default function PeopleView({ initial }: { initial?: Envelope<{ people: Person[]; total: number }> }) {
  const [q, setQ] = useUrlParam("q");
  const [pageParam, setPageParam] = useUrlParam("page");
  const [slug, setSlug] = useUrlParam("person");
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
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const [state, retry] = useApi<{ people: Person[]; total: number }>(
    mounted ? `people?${params}` : null,
    q || page ? undefined : initial,
  );
  const rows = state.status === "ready" ? state.value.data.people : [];
  const total = state.status === "ready" ? state.value.data.total : 0;
  const pin = (p: Person) =>
    pinFromColumns(
      "/podcasts/people/",
      p.slug,
      p.name,
      p,
      columns,
      state.status === "ready" ? state.value.provenance : undefined,
      "person",
      {},
      `${PODCASTS_SITE}/people/${encodeURIComponent(p.slug)}`,
    );

  return (
    <>
      <div className="mb-4">
        <FilterBar>
          <SaveView />
          <FilterSearch value={draft} onChange={setDraft} placeholder="Name, title or organisation…" />
        </FilterBar>
      </div>
      <RecordLayout>
        <DataTable
          pin={pin}
          className="flex-1"
          label="People"
          data={rows}
          columns={columns}
          getRowId={(p) => p.slug}
          status={state.status}
          error="The Podcasts API did not answer."
          onRetry={retry}
          onRowClick={(p) => setSlug(p.slug)}
          selectedId={slug}
          pageSize={PAGE}
          manual={{ rowCount: total, page, onPageChange: (p) => setPageParam(p ? String(p + 1) : null) }}
          empty="No verified speaker matches."
          toolbar={(view) => (
            <>
              <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
                {state.status === "ready" ? (
                  <>
                    <span className="text-foreground">{total.toLocaleString("en-US")}</span> verified{" "}
                    {total === 1 ? "speaker" : "speakers"}
                  </>
                ) : (
                  "loading people…"
                )}
              </p>
              {state.status === "ready" && view.rows.length > 0 && (
                <ExportMenu
                  rows={view.rows}
                  columns={peopleExport}
                  filename={`podcast-people-page-${page + 1}-${today()}`}
                  meta={{ collection: "podcasts", ...state.value.provenance, page: page + 1 }}
                />
              )}
            </>
          )}
        />
        <RecordDetail
          open={!!slug}
          onOpenChange={(v) => !v && setSlug(null)}
          title={rows.find((p) => p.slug === slug)?.name ?? "person"}
          subtitle={(() => {
            const p = rows.find((x) => x.slug === slug);
            return p ? [p.title, p.org].filter(Boolean).join(", ") || undefined : undefined;
          })()}
          className="lg:w-[28rem]"
        >
          {slug && <PersonDetail slug={slug} />}
        </RecordDetail>
      </RecordLayout>
    </>
  );
}

const peopleExport = ["slug", "name", "title", "org", "claimCount", "sourceCount"].map((k) => ({
  id: k,
  value: (p: Person) => p[k as keyof Person],
}));

function PersonDetail({ slug }: { slug: string }) {
  const [state, retry] = useApi<{ person: Person; claims: Claim[] }>(`people/${encodeURIComponent(slug)}`);
  const [claimId, setClaimId] = React.useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: close the open claim when the record changes
  React.useEffect(() => setClaimId(null), [slug]);
  if (state.status === "loading") return <RecordDetailSkeleton className="border-0 rounded-none max-w-none" />;
  if (state.status === "error")
    return <ErrorState title="this public record did not load." description={null} onRetry={retry} />;
  const { person, claims } = state.value.data;
  if (claimId)
    return (
      <>
        <button
          type="button"
          className="ui-case self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setClaimId(null)}
        >
          ← all claims by {person.name}
        </button>
        <ClaimDetail id={claimId} />
      </>
    );
  const shows = new Set(claims.map((c) => c.showName));
  return (
    <>
      <KeyValueList
        items={[
          { label: "title", value: person.title },
          { label: "organisation", value: person.org },
          {
            label: "claims shown",
            value: `${claims.length.toLocaleString("en-US")}${claims.length >= 500 ? " (newest 500)" : ""}`,
          },
          { label: "shows", value: [...shows].join(", ") },
        ]}
      />
      {person.bio && <p className="text-sm leading-relaxed">{person.bio}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Button asChild variant="outline" size="sm">
          <a href={`/podcasts/claims/?person=${encodeURIComponent(person.slug)}`}>search their claims</a>
        </Button>
        <ExternalLink href={`${PODCASTS_SITE}/people/${encodeURIComponent(person.slug)}`}>public page</ExternalLink>
      </div>
      <section>
        <h3 className="ui-case mb-2 text-xs font-medium text-muted-foreground">newest claims</h3>
        <ClaimList claims={claims.slice(0, 100)} status="ready" onOpen={(c) => setClaimId(c.id)} />
        {claims.length > 100 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing 100 of {claims.length.toLocaleString("en-US")}. Search their claims to narrow down.
          </p>
        )}
      </section>
      <LiveProvenance info={state.value.provenance} />
      <PinButton
        item={pinFromColumns(
          "/podcasts/people/",
          person.slug,
          person.name,
          person,
          columns,
          state.value.provenance,
          "person",
          {},
          `${PODCASTS_SITE}/people/${encodeURIComponent(person.slug)}`,
        )}
      />
    </>
  );
}
