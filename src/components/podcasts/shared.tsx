import { KeyValueList } from "@saas-maker/ui/blocks/record-detail";
import { Skeleton } from "@saas-maker/ui/components/skeleton";
import type { ExportColumn } from "@saas-maker/ui/lib/export";
import { ArrowUpRightIcon } from "lucide-react";
import * as React from "react";
import {
  type Claim,
  type ClaimReference,
  type Envelope,
  type Evidence,
  formatTimestamp,
  PODCASTS_SITE,
  speakerLabel,
  type TranscriptContext,
  transcriptLabel,
} from "../../adapters/podcasts";
import type { Provenance as ProvenanceInfo } from "../../adapters/types";
import { formatDate } from "../../lib/url-state";

export type Loadable<T> = { status: "loading" } | { status: "error" } | { status: "ready"; value: Envelope<T> };

/** GET /api/podcasts/… with abort on change; `key` null skips the request. */
export function useApi<T>(key: string | null): [Loadable<T>, () => void] {
  const [state, setState] = React.useState<Loadable<T>>({ status: "loading" });
  const [nonce, setNonce] = React.useState(0);
  React.useEffect(() => {
    if (key === null) return;
    void nonce;
    const ctrl = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/podcasts/${key}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Envelope<T>>) : Promise.reject(new Error(String(r.status)))))
      .then((value) => setState({ status: "ready", value }))
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setState({ status: "error" });
      });
    return () => ctrl.abort();
  }, [key, nonce]);
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

/** Timestamp as a deep link when the API has one (caption transcripts only). */
export function Timestamp({ claim }: { claim: Pick<Claim, "timestampS" | "deepLinkUrl"> }) {
  const t = formatTimestamp(claim.timestampS);
  if (!t) return null;
  return claim.deepLinkUrl ? (
    <a
      href={claim.deepLinkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono tabular-nums underline-offset-4 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {t}
    </a>
  ) : (
    <span className="font-mono tabular-nums">{t}</span>
  );
}

export function Speaker({ claim }: { claim: Claim }) {
  const verified = claim.attributionStatus === "verified_speaker" && claim.personName;
  if (!verified) return <span className="text-muted-foreground italic">unverified speaker</span>;
  return claim.personSlug ? (
    <a
      href={`/podcasts/people/?person=${encodeURIComponent(claim.personSlug)}`}
      className="text-foreground underline-offset-4 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {claim.personName}
    </a>
  ) : (
    <span className="text-foreground">{claim.personName}</span>
  );
}

/** One claim as a row: the quote first, then who said it, where and when. */
export function ClaimRow({ claim, selected, onOpen }: { claim: Claim; selected?: boolean; onOpen?: () => void }) {
  const body = (
    <>
      <p className="td-quote max-w-[75ch] text-[0.9375rem] leading-relaxed text-foreground">{claim.assertion}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <Speaker claim={claim} />
        <span aria-hidden>·</span>
        <span>{claim.showName}</span>
        {claim.saidOn && (
          <>
            <span aria-hidden>·</span>
            <time dateTime={claim.saidOn}>{formatDate(claim.saidOn)}</time>
          </>
        )}
        {claim.timestampS != null && (
          <>
            <span aria-hidden>·</span>
            <Timestamp claim={claim} />
          </>
        )}
        <span aria-hidden>·</span>
        <span className="ui-case">{claim.claimType}</span>
      </p>
    </>
  );
  return (
    <li
      data-selected={selected || undefined}
      className="border-b border-hairline last:border-b-0 data-[selected]:bg-brand-soft/50"
    >
      {onOpen ? (
        // biome-ignore lint/a11y/useSemanticElements: a row holding links cannot be a <button>
        <div
          role="button"
          tabIndex={0}
          aria-current={selected || undefined}
          onClick={onOpen}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onOpen();
            }
          }}
          className="cursor-pointer px-4 py-3 outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent"
        >
          {body}
        </div>
      ) : (
        <div className="px-4 py-3">{body}</div>
      )}
    </li>
  );
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
  if (status === "loading")
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4" aria-busy>
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    );
  if (status === "error")
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-16 text-center text-sm">
        The Podcasts API did not answer.{" "}
        {onRetry && (
          <button type="button" className="underline underline-offset-4" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  if (!claims.length)
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-16 text-center text-sm text-muted-foreground">
        {empty ?? "No published claims match."}
      </div>
    );
  return (
    <ul className="rounded-lg border border-border bg-card">
      {claims.map((c) => (
        <ClaimRow key={c.id} claim={c} selected={selectedId === c.id} onOpen={onOpen ? () => onOpen(c) : undefined} />
      ))}
    </ul>
  );
}

/**
 * Source block for data read live from the Podcasts API. The library's
 * Provenance has no "via" or "read at" rows, so this mirrors its look.
 */
export function LiveProvenance({ info, page }: { info: ProvenanceInfo; page?: string }) {
  let host = info.sourceUrl;
  let apiHost = info.viaUrl;
  try {
    host = new URL(page ?? info.sourceUrl).host;
    apiHost = new URL(info.viaUrl).host;
  } catch {
    // keep raw strings
  }
  return (
    <section aria-label="Provenance" className="rounded-lg bg-surface p-4 text-sm">
      <h3 className="ui-case text-xs font-medium text-muted-foreground">source</h3>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        <dt className="text-muted-foreground">from</dt>
        <dd className="min-w-0 truncate">
          <ExternalLink href={page ?? info.sourceUrl}>{host}</ExternalLink>
        </dd>
        <dt className="text-muted-foreground">via</dt>
        <dd className="min-w-0 truncate">
          {info.source} {info.via} · <span className="font-mono text-xs">{apiHost}</span>
        </dd>
        {info.fetchedAt && (
          <>
            <dt className="text-muted-foreground">read</dt>
            <dd>
              <time dateTime={info.fetchedAt}>
                {new Date(info.fetchedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </dd>
          </>
        )}
      </dl>
      {info.note && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{info.note}</p>}
    </section>
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
      <blockquote className="td-quote border-l-2 border-border pl-4 text-[0.9375rem] leading-relaxed">
        “{claim.quote}”
      </blockquote>
      <KeyValueList
        className="grid-cols-[7.5rem_minmax(0,1fr)]"
        items={[
          { label: "speaker", value: <Speaker claim={claim} /> },
          {
            label: "attribution",
            value: claim.attributionStatus === "verified_speaker" ? "verified speaker" : "speaker not verified",
          },
          { label: "said on", value: formatDate(claim.saidOn) },
          { label: "timestamp", value: claim.timestampS != null ? <Timestamp claim={claim} /> : "not timed" },
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
                <Timestamp claim={e} />
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
