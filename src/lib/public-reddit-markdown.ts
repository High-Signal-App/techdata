import { ATTRIBUTION, createRedditAdapter, type RedditAdapter, UpstreamError } from "../adapters/reddit";
import { publicPageCopy } from "./public-page-copy";
import { communityColumns, publicCommunities, publicPostColumns } from "./public-reddit-view";

const safe = (value: unknown) =>
  String(value ?? "—")
    .replace(/[\\[\]()*_`<>|]/g, "\\$&")
    .replace(/\s*\n\s*/g, " ");
export async function redditMarkdown(
  path: string,
  options: { base?: string; adapter?: Pick<RedditAdapter, "catalog" | "snapshot">; now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  const adapter =
    options.adapter ??
    createRedditAdapter({
      base: options.base,
      fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(5000) }),
    });
  const page = publicPageCopy[path as "/reddit/" | "/reddit/posts/"];
  const intro = `# ${page.heading}\n\n${page.description}\n\n${ATTRIBUTION}\n\nDefault public capture; interactive community, date, and filter selections are not included.\n\n`;
  const catalog = await adapter.catalog();
  const entries = catalog.data.entries.filter((entry) => Date.parse(entry.expiresAt) > now());
  if (path === "/reddit/") {
    const rows = publicCommunities(entries, now()).sort((a, b) => b.subreddit.localeCompare(a.subreddit));
    return (
      intro +
      `Catalog generated ${catalog.data.generatedAt}; latest capture ${catalog.provenance.collectedAt ?? "not recorded"}. Select a community for its exact collection window.\n\n` +
      "| " +
      communityColumns.map((column) => column.header).join(" | ") +
      " |\n| " +
      communityColumns.map(() => "---").join(" | ") +
      " |\n" +
      rows
        .slice(0, 50)
        .map((row) => "| " + communityColumns.map((column) => safe(column.value(row))).join(" | ") + " |")
        .join("\n") +
      `\n\n${rows.length} communities; first ${Math.min(50, rows.length)} shown. Source: ${catalog.provenance.sourceUrl}. Read ${catalog.provenance.fetchedAt ?? "not recorded"}.\n`
    );
  }
  const community = entries[0]?.subreddit;
  const entry = entries
    .filter((entry) => entry.subreddit === community)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!entry) return intro + "No current public captures are available.\n";
  // Never retain a serving lease or use a cached/static capture body. Every representation rechecks upstream.
  const envelope = await adapter.snapshot(entry.subreddit, entry.date, entry.source.revision.slice(0, 12));
  const snapshot = envelope.data;
  if (
    !Number.isFinite(Date.parse(snapshot.expiresAt)) ||
    Date.parse(snapshot.expiresAt) <= now() ||
    snapshot.source.revision !== entry.source.revision ||
    snapshot.subreddit.toLowerCase() !== entry.subreddit.toLowerCase() ||
    snapshot.date !== entry.date
  )
    throw new UpstreamError(410, "", "expired_or_changed", envelope.provenance);
  const rows = [...snapshot.posts].sort((a, b) => b.score - a.score).slice(0, 50);
  return (
    intro +
    `r/${snapshot.subreddit} · ${snapshot.date}\n\nCollected ${snapshot.capturedAt} · revision ${snapshot.source.revision} · expires ${snapshot.expiresAt}\n\nWindow: ${snapshot.window.start} – ${snapshot.window.end} (${snapshot.window.semantics})\n\n${snapshot.coverage.note}\n\n` +
    "| " +
    publicPostColumns.map((column) => column.header).join(" | ") +
    " |\n| " +
    publicPostColumns.map(() => "---").join(" | ") +
    " |\n" +
    rows
      .map(
        (row) =>
          "| " +
          publicPostColumns
            .map((column) =>
              safe(column.id === "createdUtc" ? new Date(row.createdUtc * 1000).toISOString() : column.value(row)),
            )
            .join(" | ") +
          " |",
      )
      .join("\n") +
    `\n\nShowing ${rows.length} of ${snapshot.posts.length} recorded threads. Source: ${envelope.provenance.sourceUrl}. Read ${envelope.provenance.fetchedAt ?? "not recorded"}. Closed thread details and retained comments are not exported.\n`
  );
}
