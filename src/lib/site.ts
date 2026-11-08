/** Verified product identity; aliases and preview request hosts never own canonicals. */
export const PUBLIC_ORIGIN = "https://data.highsignal.app";

export function pageCanonical(path: string, noindex = false) {
  if (noindex) return undefined;
  const url = new URL(PUBLIC_ORIGIN);
  url.pathname = path === "/" ? "/" : `${path.replace(/\/$/, "")}/`;
  return url.href;
}
