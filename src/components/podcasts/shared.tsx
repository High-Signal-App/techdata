import { type QuoteItem, QuoteList, QuoteSpeakerLabel, QuoteTimestamp } from "@saas-maker/ui/blocks/quote-list";
import { KeyValueList, Provenance } from "@saas-maker/ui/blocks/record-detail";
import { Skeleton } from "@saas-maker/ui/components/skeleton";
import type { ExportColumn } from "@saas-maker/ui/lib/export";
import { ArrowUpRightIcon } from "lucide-react";
import * as React from "react";
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
import { formatDate } from "../../lib/url-state";
import PinButton from "../views/PinButton";

export type Loadable<T> = { status: "loading" } | { status: "error" } | { status: "ready"; value: Envelope<T> };

/** GET /api/podcasts/… with abort on change; `key` null skips the request. */
export function useApi<T>(key: string | null, initial?: Envelope<T>): [Loadable<T>, () => void] {
  const [state, setState] = React.useState<Loadable<T>>(
    initial ? { status: "ready", value: initial } : { status: "loading" },
  );
  const [nonce, setNonce] = React.useState(0);
  const loadedKey = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (key === null) return;
    void nonce;
    const ctrl = new AbortController();
    if (!initial || loadedKey.current !== null) setState({ status: "loading" });
    loadedKey.current = key;
    fetch(`/api/podcasts/${key}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Envelope<T>>) : Promise.reject(new Error(String(r.status)))))
      .then((value) => setState({ status: "ready", value }))
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setState({ status: "error" });
      });
    return () => ctrl.abort();
  }, [key, nonce, initial]);
  return [state, () => setNonce((n) => n + 1)];
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
  const byId = new Map(claims.map((c) => [c.id, c]));
  return (
    <QuoteList
      label="Claims"
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
  if (state.status === "loading")
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  if (state.status === "error")
    return (
      <p className="text-sm">
        This claim did not load.{" "}
        <button type="button" className="underline underline-offset-4" onClick={retry}>
          Try again
        </button>
      </p>
    );
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
