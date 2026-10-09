import { KeyValueList, Provenance } from "@saas-maker/ui/blocks/record-detail";
import { nomadProvenanceInfo } from "../../adapters/nomad/meta";
import { costKey, format, metrics, type ProfileId, profiles } from "../../adapters/nomad/model.js";
import { type Place, sourceUrl, unusualCost } from "../../adapters/nomad/places";

/** Everything Nomad Atlas shows in its city field notes, in the same order. */
export function PlaceDetail({ place }: { place: Place }) {
  const row = place as unknown as Record<string, unknown>;
  const everyday = metrics.filter(([key]) => !key.startsWith("cost_for_") && key !== "overall_score");
  return (
    <>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl tabular-nums">
          {place.overall_score == null ? "—" : place.overall_score.toFixed(1)}
        </span>
        <span className="ui-case text-xs text-muted-foreground">overall, out of 5</span>
      </div>
      <section>
        <h3 className="ui-case mb-1 text-xs font-medium text-muted-foreground">monthly cost by profile</h3>
        <KeyValueList
          items={(Object.keys(profiles) as ProfileId[]).map((p) => {
            const v = row[costKey(p)];
            return {
              label: profiles[p].toLowerCase(),
              value: unusualCost(v) ? `${format(v, "money")} · unusual source estimate` : format(v, "money"),
            };
          })}
        />
      </section>
      <section>
        <h3 className="ui-case mb-1 text-xs font-medium text-muted-foreground">everyday life & working remotely</h3>
        <KeyValueList
          items={everyday.map(([key, label, type]) => ({ label: label.toLowerCase(), value: format(row[key], type) }))}
        />
      </section>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Weather and air quality are conditions at collection. These are source estimates, not live measurements.
      </p>
      <Provenance info={{ ...nomadProvenanceInfo, url: sourceUrl(place) }} />
    </>
  );
}
