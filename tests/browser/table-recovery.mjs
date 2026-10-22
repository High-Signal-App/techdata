/**
 * Browser regression; invoke with an isolated Playwright page and a live/preview
 * baseURL. No browser dependency is added to the app. API responses are synthetic.
 * A caller may supply source CSS for a no-deploy preview and an evidence directory.
 * Checks clipping geometry before click() can auto-scroll an offscreen retry.
 */
export default async function verifyTableRecovery(page, options = {}) {
  const baseURL = options.baseURL ?? "https://data.highsignal.app";
  const revision = "123456abcdef";
  const entry = {
    subreddit: "AI_Agents",
    date: "2026-10-09",
    source: { run: "acceptance-test", attempt: "1", revision },
    capturedAt: "2026-10-09T12:00:00Z",
    expiresAt: "2099-10-10T00:00:00Z",
    coverage: { status: "complete", posts: 0, comments: 0, note: "Synthetic browser regression." },
  };
  const provenance = {
    source: "Acceptance fixture",
    sourceUrl: baseURL,
    via: "local interception",
    viaUrl: baseURL,
    collectedAt: entry.capturedAt,
    fetchedAt: entry.capturedAt,
  };
  const results = [];
  for (const width of [390, 768, 1440]) {
    const context = await page
      .context()
      .browser()
      .newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
    const p = await context.newPage();
    let failed = true;
    try {
      await context.route("**/api/reddit/**", async (route) => {
        if (route.request().url().includes("/catalog"))
          return route.fulfill({
            json: {
              data: { schema: "reddit-insights.catalog.v1", generatedAt: entry.capturedAt, entries: [entry] },
              provenance,
            },
          });
        if (failed) return route.fulfill({ status: 404, json: { error: "not-archived" } });
        return route.fulfill({
          json: {
            data: {
              ...entry,
              schema: "reddit-insights.snapshot.v1",
              window: { start: entry.capturedAt, end: entry.capturedAt, semantics: "fixture" },
              posts: [],
              comments: [],
            },
            provenance,
          },
        });
      });
      await p.goto(`${baseURL}/reddit/posts/?subreddit=AI_Agents&date=2026-10-09&v=${revision}`, {
        waitUntil: "domcontentloaded",
      });
      if (options.css) await p.addStyleTag({ content: options.css });
      const error = p.locator('.resource-table [data-slot="error-state"]');
      await error.waitFor({ state: "visible" });
      const inspect = async (state) => {
        const geometry = await p.evaluate(() => {
          const region = document.querySelector('.resource-table [role="region"]');
          const clip = region.getBoundingClientRect();
          const targets = [...region.querySelectorAll("td[colspan] h3, td[colspan] button")].map((node) => {
            const rect = node.getBoundingClientRect();
            return {
              text: node.textContent,
              left: rect.left,
              right: rect.right,
              inside: rect.left >= clip.left && rect.right <= clip.right,
            };
          });
          return {
            viewport: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            scrollLeft: region.scrollLeft,
            clip: { left: clip.left, right: clip.right },
            targets,
          };
        });
        const pass =
          geometry.scrollLeft === 0 &&
          geometry.documentWidth === width &&
          geometry.targets.length > 0 &&
          geometry.targets.every((target) => target.inside);
        results.push({ width, state, pass, ...geometry });
        if (options.evidenceDir)
          await p.screenshot({ path: `${options.evidenceDir}/${width}-${state}.png`, fullPage: true });
      };
      await inspect("error");
      failed = false;
      await error.getByRole("button", { name: "try again" }).click();
      await p.getByText("no captured threads match.", { exact: true }).waitFor({ state: "visible" });
      // A correct fix never needed horizontal scrolling for the recovery action.
      await inspect("empty");
    } finally {
      await context.close();
    }
  }
  if (results.some((result) => !result.pass)) throw new Error(`Table recovery is clipped: ${JSON.stringify(results)}`);
  return results;
}
