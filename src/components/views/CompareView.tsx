import { KeyValueList, Provenance } from "@saas-maker/ui/blocks/record-detail";
import { groupPins, pinKey } from "../../lib/compare";
import { usePins } from "../../lib/local-lists";
import PinButton from "./PinButton";

export default function CompareView() {
  const { items } = usePins();
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        pins keep the facts and source dates from when you selected them. Open a record to read its current data.
        Different collections keep their own fields.
      </p>
      {!items.length && (
        <p className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
          no pinned records yet. Select rows in a collection or use “pin to compare” in a record’s details.
        </p>
      )}
      {groupPins(items).map(({ group, items }) => (
        <section key={group} aria-label={group}>
          <h2 className="mb-3 text-sm font-medium">
            <a href={group} className="hover:underline">
              {groupLabel(group)}
            </a>
          </h2>
          <section className="flex gap-4 overflow-x-auto pb-3" aria-label={`${groupLabel(group)} comparison`}>
            {items.map((item) => (
              <article
                key={pinKey(item)}
                className="flex w-80 shrink-0 flex-col gap-5 rounded-lg border border-border bg-card p-5"
              >
                <h3 className="font-display text-2xl break-words">
                  <a href={item.href} className="hover:underline">
                    {item.title}
                  </a>
                </h3>
                <KeyValueList
                  align="start"
                  items={item.fields.map((f) => ({
                    ...f,
                    value: typeof f.value === "boolean" ? (f.value ? "yes" : "no") : f.value,
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  {item.provenance.source} · collected {item.provenance.collectedAt ?? "not recorded"}
                </p>
                <Provenance
                  info={{
                    source: item.provenance.source,
                    url: item.provenance.sourceUrl,
                    collectedAt: item.provenance.collectedAt ?? undefined,
                    readAt: item.provenance.fetchedAt,
                    via: item.provenance.via,
                    viaUrl: item.provenance.viaUrl,
                    revision: item.provenance.revision,
                    note: item.provenance.note,
                  }}
                />
                <PinButton item={item} />
              </article>
            ))}
          </section>
        </section>
      ))}
    </div>
  );
}
export function groupLabel(path: string) {
  const labels: Record<string, string> = {
    "/nomad/": "nomad places",
    "/ph/": "ph products",
    "/papers/": "papers",
    "/papers/paths/": "reading paths",
    "/papers/cited/": "cited works",
    "/papers/authors/": "authors",
    "/reddit/": "reddit communities",
    "/reddit/posts/": "reddit threads",
    "/podcasts/": "podcast episodes",
    "/podcasts/claims/": "podcast claims",
    "/podcasts/people/": "verified speakers",
  };
  return labels[path] ?? path;
}
