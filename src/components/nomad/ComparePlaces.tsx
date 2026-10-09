import { Provenance } from "@saas-maker/ui/blocks/record-detail";
import { Button } from "@saas-maker/ui/components/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@saas-maker/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@saas-maker/ui/components/popover";
import { Skeleton } from "@saas-maker/ui/components/skeleton";
import { ArrowUpRightIcon, PlusIcon, XIcon } from "lucide-react";
import * as React from "react";
import { NOMAD_SNAPSHOT, nomadProvenanceInfo } from "../../adapters/nomad/meta";
import { fold, format, known } from "../../adapters/nomad/model.js";
import {
  COMPARE_METRICS,
  type Dataset,
  explorable,
  type Place,
  sourceUrl,
  unusualCost,
} from "../../adapters/nomad/places";
import { useUrlParam } from "../../lib/url-state";
import { MAX_COMPARE, parseCompare } from "./shortlist";

/** Up to three places side by side across Nomad Atlas's 22 metrics. */
export default function ComparePlaces() {
  const [all, setAll] = React.useState<Place[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    fetch(NOMAD_SNAPSHOT.file)
      .then((r) => (r.ok ? (r.json() as Promise<Dataset>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => setAll(explorable(d.cities)))
      .catch(() => setFailed(true));
  }, []);
  const [param, setParam] = useUrlParam("places");
  const slugs = parseCompare(param);
  const bySlug = React.useMemo(() => new Map((all ?? []).map((p) => [p.slug, p])), [all]);
  const chosen = slugs.map((s) => bySlug.get(s)).filter((p): p is Place => !!p);
  const set = (next: string[]) => setParam(next.length ? next.join(",") : null);

  if (failed) return <p className="text-sm">The places snapshot did not load. Refresh to try again.</p>;
  if (!all) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {chosen.map((p) => (
          <span key={p.slug} className="inline-flex h-8 items-center gap-1 rounded-full bg-secondary pl-3 pr-1 text-sm">
            {p.name}
            <button
              type="button"
              onClick={() => set(slugs.filter((s) => s !== p.slug))}
              aria-label={`Remove ${p.name}`}
              className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </span>
        ))}
        {chosen.length < MAX_COMPARE && (
          <AddPlace places={all} exclude={slugs} onAdd={(slug) => set([...slugs, slug])} />
        )}
        <Button asChild variant="link" size="sm" className="text-muted-foreground">
          <a href={`/nomad/${slugs.length ? `?compare=${slugs.join(",")}` : ""}`}>back to places</a>
        </Button>
      </div>

      {chosen.length < 2 ? (
        <p className="rounded-lg border border-border px-4 py-16 text-center text-sm text-muted-foreground">
          Pick {chosen.length ? "one more place" : "two or three places"} to compare them side by side.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Places compared across {COMPARE_METRICS.length} metrics</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="ui-case sticky left-0 z-10 border-b border-border bg-card px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                >
                  metric
                </th>
                {chosen.map((p) => (
                  <th key={p.slug} scope="col" className="min-w-36 border-b border-border px-4 py-3 text-right">
                    <span className="block font-medium text-foreground">{p.name}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{p.country}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_METRICS.map(([key, label, type]) => (
                <tr key={key}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-hairline bg-card px-4 py-2.5 text-left font-normal text-muted-foreground"
                  >
                    {label}
                  </th>
                  {chosen.map((p) => {
                    const v = p[key];
                    const flag =
                      type === "money" &&
                      (key.startsWith("cost_for_") ? unusualCost(v) : known(v) && (v as number) > 30000);
                    return (
                      <td key={p.slug} className="border-b border-hairline px-4 py-2.5 text-right tabular-nums">
                        {format(v, type)}
                        {flag && <span className="block text-xs text-muted-foreground">unusual source estimate</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-normal text-muted-foreground"
                >
                  Source
                </th>
                {chosen.map((p) => (
                  <td key={p.slug} className="px-4 py-2.5 text-right">
                    <a
                      href={sourceUrl(p)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                    >
                      Nomads.com <ArrowUpRightIcon className="size-3.5 text-muted-foreground" aria-hidden />
                    </a>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <Provenance className="max-w-xl" info={nomadProvenanceInfo} />
    </div>
  );
}

function AddPlace({ places, exclude, onAdd }: { places: Place[]; exclude: string[]; onAdd: (slug: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const t = fold(q.trim());
  const matches = t
    ? places
        .filter((p) => !exclude.includes(p.slug) && fold(`${p.name} ${p.country}`).includes(t))
        .sort((a, b) => Number(!fold(a.name).startsWith(t)) - Number(!fold(b.name).startsWith(t)))
        .slice(0, 12)
    : [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full">
          <PlusIcon />
          add place
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="City or country…" value={q} onValueChange={setQ} />
          <CommandList>
            {t && <CommandEmpty>No place matches.</CommandEmpty>}
            {matches.map((p) => (
              <CommandItem
                key={p.slug}
                value={p.slug}
                onSelect={() => {
                  onAdd(p.slug);
                  setQ("");
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="truncate text-xs text-muted-foreground">{p.country}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
