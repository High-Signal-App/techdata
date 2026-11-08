/** Run against an owned local build with hostile metadata prepared in cold
 * public product shards. The caller restores the assets and restarts the preview
 * afterward, clearing the immutable product cache. No production data is changed.
 */
export default async function verifyJsonLdSafety(page, { baseURL, cases }) {
  if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?$/.test(baseURL)) throw Error("Local preview required");
  const results = [];
  for (const fixture of cases) {
    const context = await page
      .context()
      .browser()
      .newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
    const p = await context.newPage();
    try {
      const response = await p.goto(`${baseURL.replace(/\/$/, "")}/ph/products/${encodeURIComponent(fixture.slug)}/`, {
        waitUntil: "networkidle",
      });
      if (response.status() !== 200) throw Error(`Unexpected status: ${response.status()}`);
      const result = await p.evaluate(() => ({
        canary: window.__jsonLdXss ?? null,
        injectedScripts: document.querySelectorAll("script[data-jsonld-canary]").length,
        jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) =>
          JSON.parse(script.textContent),
        ),
        heading: document.querySelector("h1").textContent,
        main: document.querySelector("main").textContent,
        metaDescription: document.querySelector('meta[name="description"]').content,
      }));
      if (result.canary !== null || result.injectedScripts !== 0 || result.jsonLd.length !== 1)
        throw Error(`Executable injection: ${JSON.stringify(result)}`);
      if (result.jsonLd[0].name !== `${fixture.title} · techdata`) throw Error("JSON-LD title did not round trip");
      if (result.jsonLd[0].description !== result.metaDescription)
        throw Error("JSON-LD description differs from escaped metadata");
      if (result.heading !== fixture.title || !result.main.includes(fixture.description))
        throw Error("Visible text was not preserved");
      results.push({
        id: fixture.id,
        slug: fixture.slug,
        status: response.status(),
        canary: result.canary,
        injectedScripts: result.injectedScripts,
        jsonLdBlocks: result.jsonLd.length,
        visibleTextPreserved: true,
      });
    } finally {
      await context.close();
    }
  }
  return results;
}
