// Public key is pinned to https://data.highsignal.app; never put an ingest key here.
export const APP_HEALTH_PUBLIC_KEY = "ahk_pub_c6f412f471a92d82cc6a6ea1aa9f8cc17146d7fda01c0333fd08756de9bf6860";

export function shouldCollectBrowserAnalytics(url: URL): boolean {
  return url.origin === "https://data.highsignal.app" && url.searchParams.get("fleet_qa") !== "1";
}
