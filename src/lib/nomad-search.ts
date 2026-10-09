import { fold } from "../adapters/nomad/model.js";
import { costOf, type Place } from "../adapters/nomad/places";
import type { SearchHit } from "../adapters/types";

export { fold };

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Places whose name or country contains the query (accent-insensitive), name matches first, then countries. */
export function searchPlaces(places: Place[], query: string, limit = 6): SearchHit[] {
  const t = fold(query.trim());
  if (!t) return [];
  const matches = places
    .filter((p) => fold(`${p.name} ${p.country}`).includes(t))
    .sort(
      (a, b) =>
        Number(!fold(a.name).startsWith(t)) - Number(!fold(b.name).startsWith(t)) ||
        (b.overall_score ?? 0) - (a.overall_score ?? 0),
    )
    .slice(0, limit);
  const hits: SearchHit[] = matches.map((p) => {
    const cost = costOf(p, "nomad");
    return {
      collection: "nomad",
      kind: "places",
      id: p.slug,
      title: p.name,
      subtitle: `${p.country} · ${p.region}`,
      meta: cost == null ? undefined : `${usd(cost)}/mo`,
      href: `/nomad/?place=${encodeURIComponent(p.slug)}`,
    };
  });
  const countries = new Map<string, number>();
  for (const p of places)
    if (fold(p.country).includes(t)) countries.set(p.country, (countries.get(p.country) ?? 0) + 1);
  for (const [country, n] of [...countries].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    hits.push({
      collection: "nomad",
      kind: "countries",
      id: country,
      title: country,
      subtitle: "filter places by this country",
      meta: `${n} ${n === 1 ? "place" : "places"}`,
      href: `/nomad/?country=${encodeURIComponent(country)}`,
    });
  }
  return hits;
}
