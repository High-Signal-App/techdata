import { type QuoteItem, QuoteList, QuoteSpeakerLabel, QuoteTimestamp } from "@saas-maker/ui/blocks/quote-list";
import { KeyValueList, Provenance } from "@saas-maker/ui/blocks/record-detail";
import { QuoteListSkeleton, RecordDetailSkeleton } from "@saas-maker/ui/blocks/skeletons";
import { EmptyState } from "@saas-maker/ui/components/empty-state";
import { ErrorState } from "@saas-maker/ui/components/error-state";
import type { ExportColumn } from "@saas-maker/ui/lib/export";
import { ArrowUpRightIcon } from "lucide-react";
import type * as React from "react";
import {
  type Claim,
  type ClaimReference,
  type Envelope,
  type Evidence,
  PODCASTS_SITE,
  speakerLabel,
  type TranscriptContext,
  transcriptLabel,
} from "../../adapters/podcasts";
import type { Provenance as ProvenanceInfo } from "../../adapters/types";
import { pinClaim } from "../../lib/podcast-pins";
import { useJsonResource } from "../../lib/resource";
import { formatDate } from "../../lib/url-state";
import PinButton from "../views/PinButton";

export type Loadable<T> = { status: "loading" } | { status: "error" } | { status: "ready"; value: Envelope<T> };

/** Public reads share cached content and revalidate without clearing the view. */
export function useApi<T>(key: string | null, initial?: Envelope<T>): [Loadable<T>, () => void] {
  const resource = useJsonResource<Envelope<T>>(key === null ? null : `/api/podcasts/${key}`, initial);
  return [
    resource.status === "error"
      ? { status: "error" }
      : resource.data
        ? { status: "ready", value: resource.data }
        : { status: "loading" },
    resource.retry,
  ];
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
    >
      {children}
      <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </a>
  );
}

/** A claim as a library quote row; speaker names only when the API verified them. */
export function toQuote(c: Claim): QuoteItem {
  return {
    id: c.id,
    quote: c.assertion,
    speaker: {
      name: c.personName,
      verified: c.attributionStatus === "verified_speaker",
      href: c.personSlug ? `/podcasts/people/?person=${encodeURIComponent(c.personSlug)}` : undefined,
    },
    source: { label: c.showName },
    date: c.saidOn,
    timestamp: c.timestampS == null ? null : { seconds: c.timestampS, href: c.deepLinkUrl },
    type: c.claimType,
  };
}

export function ClaimList({
  claims,
  status,
  selectedId,
  onOpen,
  empty,
  onRetry,
}: {
  claims: Claim[];
  status: "loading" | "error" | "ready";
  selectedId?: string | null;
  onOpen?: (c: Claim) => void;
  empty?: React.ReactNode;
  onRetry?: () => void;
}) {
  if (status === "loading") return <QuoteListSkeleton rows={8} label="claims" className="resource-quotes" />;
  if (status === "error")
    return (
      <ErrorState
        className="resource-quotes"
        title="the podcasts api did not answer."
        description={null}
        onRetry={onRetry}
      />
    );
  if (!claims.length)
    return <EmptyState className="resource-quotes" title="no published claims match." description={empty} />;
  const byId = new Map(claims.map((c) => [c.id, c]));
  return (
    <QuoteList
      className="resource-quotes"
      label="claims"
      items={claims.map(toQuote)}
      status={status}
      selectedId={selectedId}
      onOpen={onOpen ? (q) => onOpen(byId.get(q.id) as Claim) : undefined}
      empty={empty ?? "No published claims match."}
      error="The Podcasts API did not answer."
      onRetry={onRetry}
    />
  );
}

/** Provenance for a live Podcasts API read: from the site, via the API, read at fetch time. */
export function LiveProvenance({ info, page }: { info: ProvenanceInfo; page?: string }) {
  return (
    <Provenance
      info={{
        source: info.source,
        url: page ?? info.sourceUrl,
        via: `${info.source} ${info.via}`,
        viaUrl: info.viaUrl,
        readAt: info.fetchedAt,
        note: info.note,
      }}
    />
  );
}

type ClaimDetailData = {
  claim: Claim;
  evidence: Evidence[];
  references: ClaimReference[];
  context?: TranscriptContext | null;
  contextStatus?: string;
};

/** Full claim: verbatim quote, transcript window, evidence, references and provenance. */
export function ClaimDetail({ id }: { id: string }) {
  const [state, retry] = useApi<ClaimDetailData>(`claims/${encodeURIComponent(id)}?context=1`);
  if (state.status === "loading") return <RecordDetailSkeleton className="border-0 rounded-none max-w-none" />;
  if (state.status === "error")
    return <ErrorState title="this claim did not load." description={null} onRetry={retry} />;
  const { claim, evidence, references, context } = state.value.data;
  return (
    <>
      <blockquote className="border-l-2 border-border pl-4 text-[0.9375rem] leading-relaxed text-pretty">
        “{claim.quote}”
      </blockquote>
      <KeyValueList
        items={[
          { label: "speaker", value: <QuoteSpeakerLabel speaker={toQuote(claim).speaker} /> },
          {
            label: "attribution",
            value: claim.attributionStatus === "verified_speaker" ? "verified speaker" : "speaker not verified",
          },
          { label: "said on", value: formatDate(claim.saidOn) },
          {
            label: "timestamp",
            value: claim.timestampS != null ? <QuoteTimestamp timestamp={toQuote(claim).timestamp} /> : "not timed",
          },
          { label: "type", value: claim.claimType },
          { label: "stance", value: claim.stance },
          { label: "show", value: claim.showName },
          {
            label: "episode",
            value: (
              <a
                href={`/podcasts/?episode=${encodeURIComponent(claim.episodeId)}`}
                className="underline-offset-4 hover:underline"
              >
                {claim.episodeTitle}
              </a>
            ),
          },
          { label: "transcript", value: transcriptLabel(claim.transcriptKind) },
        ]}
      />
      {claim.assertion !== claim.quote && (
        <section>
          <h3 className="ui-case mb-1 text-xs font-medium text-muted-foreground">as summarised</h3>
          <p className="text-sm leading-relaxed">{claim.assertion}</p>
        </section>
      )}
      {context && <TranscriptWindow context={context} />}
      {evidence.length > 1 && (
        <section>
          <h3 className="ui-case mb-2 text-xs font-medium text-muted-foreground">evidence</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {evidence.map((e) => (
              <li key={e.id} className="leading-relaxed">
                <span className="ui-case mr-2 text-xs text-muted-foreground">{e.role}</span>“{e.quote}”{" "}
                <QuoteTimestamp
                  timestamp={e.timestampS == null ? null : { seconds: e.timestampS, href: e.deepLinkUrl }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {references.length > 0 && (
        <section>
          <h3 className="ui-case mb-2 text-xs font-medium text-muted-foreground">mentions</h3>
          <ul className="flex flex-wrap gap-1.5">
            {references.map((r) => (
              <li key={r.id} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                {r.name} <span className="text-muted-foreground">· {r.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {claim.sourceUrl && <ExternalLink href={claim.sourceUrl}>episode source</ExternalLink>}
        <ExternalLink href={`${PODCASTS_SITE}/claims/${encodeURIComponent(claim.id)}`}>public claim page</ExternalLink>
      </div>
      <LiveProvenance info={state.value.provenance} page={claim.sourceUrl ?? undefined} />
      <PinButton item={pinClaim(claim, state.value.provenance)} />
    </>
  );
}

function TranscriptWindow({ context }: { context: TranscriptContext }) {
  const { text, quoteStart, quoteEnd } = context;
  const ok = quoteStart >= 0 && quoteEnd <= text.length && quoteStart < quoteEnd;
  return (
    <section>
      <h3 className="ui-case mb-2 text-xs font-medium text-muted-foreground">transcript around the quote</h3>
      <p className="max-h-64 overflow-y-auto rounded-lg bg-surface p-3 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
        {ok ? (
          <>
            {text.slice(0, quoteStart)}
            <mark className="bg-brand-soft text-foreground">{text.slice(quoteStart, quoteEnd)}</mark>
            {text.slice(quoteEnd)}
          </>
        ) : (
          text
        )}
      </p>
    </section>
  );
}

export const claimExportColumns: ExportColumn<Claim>[] = [
  { id: "id", value: (c) => c.id },
  { id: "saidOn", value: (c) => c.saidOn },
  { id: "speaker", value: (c) => speakerLabel(c) },
  { id: "personSlug", value: (c) => c.personSlug },
  { id: "attributionStatus", value: (c) => c.attributionStatus },
  { id: "claimType", value: (c) => c.claimType },
  { id: "assertion", value: (c) => c.assertion },
  { id: "quote", value: (c) => c.quote },
  { id: "showName", value: (c) => c.showName },
  { id: "episodeTitle", value: (c) => c.episodeTitle },
  { id: "episodeId", value: (c) => c.episodeId },
  { id: "timestampS", value: (c) => c.timestampS },
  { id: "deepLinkUrl", value: (c) => c.deepLinkUrl },
  { id: "sourceUrl", value: (c) => c.sourceUrl },
  { id: "transcriptKind", value: (c) => c.transcriptKind },
];
