import { consoleNav } from "./nav";

/** Relative URLs keep this descriptive index independent of production identity. */
export function agentIndex(full = false) {
  const notes: Record<string, string> = {
    "nomad atlas": "A saved Nomad Atlas snapshot from Nomads.com; scores are not live conditions.",
    podcasts:
      "Published claims, episodes and verified speakers from High Signal Podcasts. Unverified attribution stays missing.",
    "reddit insights":
      "Recorded captures via Reddit Insights. Scores are recorded values; retained comments are filtered and authors are omitted. Captures may expire or be removed.",
    "ph catalog":
      "Product Hunt metadata from PH Catalog, queried with DuckDB-WASM. No votes or launch dates; per-record collection dates are not recorded.",
    "research papers":
      "Public Research Papers exports (CC-BY 4.0), plus the existing public OpenAlex citation view. Export collection dates are not recorded; unavailable sources stay unavailable.",
  };
  return `${[
    "# techdata",
    "> Public, read-only data workbench, with sources and collection/fetch dates.",
    "Collections retain their own schemas and collectors. Missing upstream dates are not invented. Saved views and pinned comparisons stay on this device.",
    ...consoleNav("overview")
      .filter((group) => group.title !== "sources")
      .map((group) =>
        [
          `## ${group.title ?? "Workbench"}`,
          ...(full && group.title ? [notes[group.title]] : []),
          ...group.items.map((item) => `- [${item.label}](${item.href})`),
        ].join("\n\n"),
      ),
    "## Text and crawl indexes\n\n- [LLM index](/llms.txt)\n- [Expanded index](/llms-full.txt)\n- [Workbench Markdown](/index.md)\n- [Sitemap](/sitemap.xml)\n- [Robots](/robots.txt)",
    ...(full
      ? [
          "These indexes describe available routes, not live data availability or production acceptance. Use each record's provenance and the collection's data notes before interpreting or exporting it.",
        ]
      : []),
  ].join("\n\n")}\n`;
}
