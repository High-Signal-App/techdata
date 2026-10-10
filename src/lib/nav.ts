import type { ConsolePageProps } from "@saas-maker/templates/console-page";
import { NOMAD_SNAPSHOT } from "../adapters/nomad/meta";

export type NavKey =
  | "compare"
  | "reddit-communities"
  | "reddit-posts"
  | "ph-products"
  | "overview"
  | "nomad-places"
  | "nomad-compare"
  | "nomad-notes"
  | "podcasts-claims"
  | "podcasts-episodes"
  | "podcasts-people"
  | "papers-papers"
  | "papers-paths"
  | "papers-cited"
  | "papers-authors";

/** Collections sidebar. Counts are shown only where they are known without a request. */
export function consoleNav(active: NavKey): ConsolePageProps["nav"] {
  const item = (key: NavKey, label: string, href: string, count?: number) => ({
    label,
    href,
    count,
    active: key === active,
  });
  return [
    { items: [item("overview", "overview", "/"), item("compare", "compare tray", "/compare/")] },
    {
      title: "nomad atlas",
      items: [
        item("nomad-places", "places", "/nomad/", NOMAD_SNAPSHOT.explorable),
        item("nomad-compare", "compare", "/nomad/compare/"),
        item("nomad-notes", "data notes", "/nomad/notes/"),
      ],
    },
    {
      title: "podcasts",
      items: [
        item("podcasts-claims", "claims", "/podcasts/claims/"),
        item("podcasts-episodes", "episodes", "/podcasts/"),
        item("podcasts-people", "people", "/podcasts/people/"),
      ],
    },
    {
      title: "reddit insights",
      items: [item("reddit-communities", "subreddits", "/reddit/"), item("reddit-posts", "threads", "/reddit/posts/")],
    },
    { title: "ph catalog", items: [item("ph-products", "products", "/ph/")] },
    {
      title: "research papers",
      items: [
        item("papers-papers", "papers", "/papers/"),
        item("papers-paths", "reading paths", "/papers/paths/"),
        item("papers-cited", "cited works", "/papers/cited/"),
        item("papers-authors", "authors", "/papers/authors/"),
      ],
    },
    {
      title: "sources",
      items: [
        { label: "reddit insights", href: "https://reddit-insights.highsignal.app/", external: true },
        { label: "nomad atlas", href: "https://nomad.significanthobbies.com/", external: true },
        { label: "research papers", href: "https://papers.highsignal.app/", external: true },
        { label: "high signal podcasts", href: "https://podcasts.highsignal.app/", external: true },
      ],
    },
  ];
}
