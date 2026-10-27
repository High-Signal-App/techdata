import type { DataColumn } from "@saas-maker/ui/components/data-table";
import { isValidElement, type ReactNode } from "react";
import dataset from "../../public/data/nomad/cities.json";
import phSummary from "../../public/data/ph/summary.json";
import { nomadProvenance } from "../adapters/nomad/meta";
import { placesSummary } from "../adapters/nomad/summary";
import { sortPapers } from "../adapters/papers";
import { phPreview } from "../adapters/ph/summary";
import { speakerLabel } from "../adapters/podcasts";
import type { Provenance } from "../adapters/types";
import { columnsFor } from "../components/nomad/PlacesExplorer";
import { NAMES, VIEWS } from "../components/Overview";
import { paperColumns } from "../components/papers/PapersView";
import { authorColumns, citedColumns, pathColumns } from "../components/papers/PublicTables";
import { columns as productColumns } from "../components/ph/ProductsView";
import { columns as episodeColumns } from "../components/podcasts/EpisodesView";
import { columns as peopleColumns } from "../components/podcasts/PeopleView";
import { toQuote } from "../components/podcasts/shared";
import type { PublicBuildSnapshot } from "./public-build-data";
import { type PublicPath, publicPageCopy } from "./public-page-copy";
import { formatDate } from "./url-state";

/** Read only the existing cell presentation result; never render/scrape HTML or run hooks. */
function cellText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return safe(String(node));
  if (Array.isArray(node)) return node.map(cellText).join("");
  if (
    isValidElement<{ children?: ReactNode; href?: string; hidden?: boolean; "aria-hidden"?: boolean | string }>(node)
  ) {
    if (node.props.hidden || node.props["aria-hidden"] === true || node.props["aria-hidden"] === "true") return "";
    if (typeof node.type !== "string") throw Error("Unsupported public table cell component");
    const text = cellText(node.props.children);
    return node.type === "a" && node.props.href ? `[${text}](${node.props.href})` : text;
  }
  throw Error("Unsupported public table cell");
}
const defaultValue = (value: unknown) =>
  typeof value === "number"
    ? value.toLocaleString("en-US")
    : value == null || value === ""
      ? "—"
      : typeof value === "boolean"
        ? value
          ? "yes"
          : "no"
        : String(value);
const safe = (value: string) => value.replace(/[\\[\]()*_`<>|]/g, "\\$&").replace(/\s*\n\s*/g, " ");
function table<T>(rows: T[], columns: DataColumn<T>[]) {
  const visible = columns.filter((column) => !column.hidden);
  return [
    "| " + visible.map((column) => safe(column.header)).join(" | ") + " |",
    "| " + visible.map(() => "---").join(" | ") + " |",
    ...rows.map(
      (row) =>
        "| " +
        visible
          .map((column) => (column.cell ? cellText(column.cell(row)) : safe(defaultValue(column.value(row)))))
          .join(" | ") +
        " |",
    ),
  ].join("\n");
}
export function provenance(info: Provenance | undefined) {
  if (!info) return "";
  return `\n\nSource: [${info.source}](${info.sourceUrl})\n\nVia: ${info.via}${info.viaUrl ? ` (${info.viaUrl})` : ""}\n\nCollected: ${info.collectedAt ?? "not recorded"}${info.fetchedAt ? ` · fetched ${info.fetchedAt}` : ""}${info.revision ? ` · revision ${info.revision}` : ""}\n\n${info.note ?? ""}\n`;
}
function rowsBlock<T>(
  value: { data: { rows: T[]; total?: number }; provenance: Provenance; missing?: string[] } | null,
  columns: DataColumn<T>[],
  sort = true,
) {
  if (!value) return "This public export did not load at build time. Open the HTML page to retry the source.\n";
  const all = sort
    ? [...value.data.rows].sort((a, b) =>
        String(columns[0].value(a) ?? "").localeCompare(String(columns[0].value(b) ?? "")),
      )
    : value.data.rows;
  return `${value.data.total ?? all.length} records · first ${Math.min(50, all.length)} shown.\n\n${table(all.slice(0, 50), columns)}${provenance(value.provenance)}${value.missing?.length ? `\nUnavailable exports: ${value.missing.join(", ")}\n` : ""}`;
}
export function buildPublicMarkdown(snapshot: PublicBuildSnapshot, notes: string) {
  const body: Partial<Record<PublicPath, string>> = {};
  body["/"] = snapshot.overview
    .map((row) =>
      "error" in row
        ? `## ${NAMES[row.id]}\n\n${row.error}`
        : `## ${row.label}\n\n${row.description}\n\n${Object.entries(row.counts)
            .map(([key, value]) => `- ${key}: ${value.toLocaleString("en-US")}`)
            .join(
              "\n",
            )}${provenance(row.provenance)}\nMode: ${row.mode}\n\n${VIEWS[row.id]?.map((view) => `[${view.label}](${view.href})`).join(" · ")}`,
    )
    .join("\n\n");
  const nomad = placesSummary(dataset.cities);
  body["/nomad/"] =
    `${nomad.total.toLocaleString("en-US")} places · ${nomad.countries} countries and territories\n\n${table(nomad.rows, columnsFor("nomad"))}${provenance(nomadProvenance)}`;
  body["/nomad/notes/"] = notes + provenance(nomadProvenance);
  const preview = phPreview(phSummary);
  body["/ph/"] =
    `Showing ${preview.rows.length} initial products of ${preview.total.toLocaleString("en-US")}. No votes or launch dates.\n\n${table(preview.rows, productColumns)}${provenance(preview.provenance)}\nExported ${preview.provenance.exportedAt} · [source release](${preview.provenance.releaseUrl})\n`;
  body["/papers/"] = snapshot.papers
    ? rowsBlock(
        { ...snapshot.papers, data: { ...snapshot.papers.data, rows: sortPapers(snapshot.papers.data.rows) } },
        paperColumns,
        false,
      )
    : rowsBlock(null, paperColumns);
  body["/papers/paths/"] = rowsBlock(snapshot.paths, pathColumns);
  body["/papers/cited/"] = rowsBlock(snapshot.cited, citedColumns);
  body["/papers/authors/"] = rowsBlock(snapshot.authors, authorColumns);
  body["/podcasts/"] = snapshot.episodes
    ? `${snapshot.episodes.data.total.toLocaleString("en-US")} episodes\n\n${table(snapshot.episodes.data.sources, episodeColumns)}${provenance(snapshot.episodes.provenance)}`
    : "The Podcasts API did not answer at build time.\n";
  body["/podcasts/people/"] = snapshot.people
    ? `${snapshot.people.data.total.toLocaleString("en-US")} verified speakers\n\n${table(snapshot.people.data.people, peopleColumns)}${provenance(snapshot.people.provenance)}`
    : "The Podcasts API did not answer at build time.\n";
  body["/podcasts/claims/"] = snapshot.claims
    ? `Latest ${snapshot.claims.data.claims.length} published claims\n\n` +
      snapshot.claims.data.claims
        .map((claim) => {
          const quote = toQuote(claim);
          return `> ${quote.quote.replaceAll("\n", "\n> ")}\n\n${speakerLabel(claim)} · ${quote.source?.label ?? ""} · ${formatDate(quote.date) ?? "date not recorded"} · ${claim.claimType}${quote.timestamp ? ` · ${quote.timestamp.seconds}s${quote.timestamp.href ? ` (${quote.timestamp.href})` : ""}` : ""}`;
        })
        .join("\n\n") +
      provenance(snapshot.claims.provenance)
    : "The Podcasts API did not answer at build time.\n";
  const documents: Partial<Record<PublicPath, string>> = {};
  for (const [path, value] of Object.entries(body)) {
    const page = publicPageCopy[path as PublicPath];
    documents[path as PublicPath] =
      `# ${page.heading}\n\n${page.description}\n\n${value}\n\nHTML initial-data snapshot captured ${snapshot.capturedAt}. The interactive page can refresh its public sources; local selections and saved state are not included.\n`;
  }
  return documents;
}
