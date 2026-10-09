import { Button } from "@saas-maker/ui/components/button";
import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import type { ProfileId } from "../../adapters/nomad/model.js";
import type { Place } from "../../adapters/nomad/places";

export const MAX_COMPARE = 3;

/** "lisbon-portugal,porto-portugal" → unique slugs, at most three. */
export function parseCompare(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[a-z0-9-]+$/.test(s)),
    ),
  ].slice(0, MAX_COMPARE);
}

export function compareHref(slugs: string[], profile: ProfileId = "nomad") {
  const p = new URLSearchParams({ places: slugs.join(",") });
  if (profile !== "nomad") p.set("profile", profile);
  return `/nomad/compare/?${p}`;
}

/** Compare toggle for place cards; the table picks rows with DataTable selection. */
export function CompareToggle({
  place,
  selected,
  onToggle,
}: {
  place: Place;
  selected: boolean;
  onToggle: (slug: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${selected ? "Remove" : "Add"} ${place.name} ${selected ? "from" : "to"} comparison`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(place.slug);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className="ui-case inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:text-foreground"
    >
      <span
        aria-hidden
        className="inline-flex size-4 items-center justify-center rounded-[4px] border border-input bg-background [[aria-pressed=true]_&]:border-foreground [[aria-pressed=true]_&]:bg-foreground [[aria-pressed=true]_&]:text-background"
      >
        {selected ? <CheckIcon className="size-3" /> : <PlusIcon className="size-3" />}
      </span>
      {selected ? "in compare" : "compare"}
    </button>
  );
}

/** Bottom bar while places are shortlisted; opens the side-by-side view. */
export function ShortlistBar({
  places,
  notice,
  onClear,
  profile,
}: {
  places: Place[];
  notice: string | null;
  onClear: () => void;
  profile: ProfileId;
}) {
  if (!places.length) return null;
  const ready = places.length >= 2;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <section
        aria-label="Comparison shortlist"
        className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3 shadow-lg"
      >
        <div className="min-w-0 flex-1">
          <p className="ui-case text-xs text-muted-foreground">
            {notice ?? `shortlist · ${places.length} of ${MAX_COMPARE}`}
          </p>
          <p className="truncate text-sm">{places.map((p) => p.name).join(" · ")}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear shortlist">
          <XIcon />
        </Button>
        {ready ? (
          <Button asChild size="sm">
            <a
              href={compareHref(
                places.map((p) => p.slug),
                profile,
              )}
            >
              compare {places.length}
            </a>
          </Button>
        ) : (
          <Button size="sm" disabled>
            add one more
          </Button>
        )}
      </section>
    </div>
  );
}
