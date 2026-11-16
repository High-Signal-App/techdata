// Public key is pinned to https://data.highsignal.app; never put an ingest key here.
export const APP_HEALTH_PUBLIC_KEY = "ahk_pub_b1b8dc282e98220ed0ccad52169d295127d3d9c0b7aec9f310cdeb7e5389a997";

export function shouldCollectBrowserAnalytics(url: URL): boolean {
  return url.origin === "https://data.highsignal.app" && url.searchParams.get("fleet_qa") !== "1";
}
