import { NOMAD_SNAPSHOT } from "../adapters/nomad/meta";
import { PH_META } from "../adapters/ph/meta";

/** Authored page copy shared by HTML and source-backed public Markdown. */
export const publicPageCopy = {
  "/": {
    title: "overview",
    heading: "collections",
    description:
      "Search and compare five public data collections in one read-only workbench, with source provenance kept in view.",
  },
  "/nomad/": {
    title: "places \u00b7 nomad atlas",
    heading: "places",
    description: `Cost of living, internet and everyday-life scores for ${NOMAD_SNAPSHOT.explorable.toLocaleString("en-US")} places in ${NOMAD_SNAPSHOT.countries} countries and territories, from the Nomads.com snapshot Nomad Atlas saved on 7 Sep 2026.`,
  },
  "/nomad/notes/": {
    title: "data notes \u00b7 nomad atlas",
    heading: "data notes",
    description: "What the Nomad Atlas numbers are, and what they are not.",
  },
  "/papers/authors/": {
    title: "authors \u00b7 research papers",
    heading: "authors",
    description:
      "Author rankings and their published top arXiv IDs from the public export. Research Papers (High Signal), CC-BY 4.0.",
  },
  "/papers/cited/": {
    title: "cited works \u00b7 research papers",
    heading: "cited works",
    description:
      "Most-cited external works from the public corpus export; aggregate counts only. Research Papers (High Signal), CC-BY 4.0.",
  },
  "/papers/": {
    title: "papers \u00b7 research papers",
    heading: "papers",
    description:
      "Selected public arXiv and OpenReview papers with citation metrics and review signals. Research Papers (High Signal), CC-BY 4.0.",
  },
  "/papers/paths/": {
    title: "reading paths \u00b7 research papers",
    heading: "reading paths",
    description:
      "Attributed reading paths, in published order, with their source and trust notes. Research Papers (High Signal), CC-BY 4.0.",
  },
  "/ph/": {
    title: "PH Catalog",
    heading: "PH Catalog",
    description: `${PH_META.coverageLabel}. Product Hunt metadata: browse the first page immediately, then search and filter the full catalog in your browser. No votes or launch dates.`,
  },
  "/podcasts/claims/": {
    title: "claims \u00b7 podcasts",
    heading: "claims",
    description:
      "Published claims with the verbatim quote, the verified speaker, the episode and, for captioned episodes, the timestamp. Read live from the High Signal Podcasts public API.",
  },
  "/podcasts/": {
    title: "episodes \u00b7 podcasts",
    heading: "episodes",
    description:
      "Podcast episodes with at least one published claim, newest first. Read live from the High Signal Podcasts public API.",
  },
  "/podcasts/people/": {
    title: "people \u00b7 podcasts",
    heading: "people",
    description:
      "Verified speakers with published claims, most claims first. Unverified speakers are labelled on their claims and never listed here.",
  },
  "/reddit/": {
    title: "subreddits \u00b7 reddit insights",
    heading: "subreddits",
    description:
      "Captured communities, available collection dates and coverage. Read from the public Reddit Insights Snapshot API.",
  },
  "/reddit/posts/": {
    title: "threads \u00b7 reddit insights",
    heading: "threads",
    description:
      "Recorded scores and retained discussion in a selected capture. Comments are filtered; authors are omitted.",
  },
} as const;
export type PublicPath = keyof typeof publicPageCopy;
