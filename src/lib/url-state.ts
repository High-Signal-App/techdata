import * as React from "react";

/** Reads one query param, follows back/forward and same-page palette jumps. */
export function useUrlParam(
  key: string,
  initial: string | null = null,
): [string | null, (value: string | null) => void] {
  const [value, setValue] = React.useState<string | null>(initial);
  React.useEffect(() => {
    const read = () => setValue(new URLSearchParams(location.search).get(key));
    read();
    addEventListener("popstate", read);
    return () => removeEventListener("popstate", read);
  }, [key]);
  const update = React.useCallback(
    (next: string | null) => {
      setValue(next);
      setParam(key, next);
    },
    [key],
  );
  return [value, update];
}

/** Replaces one query param without adding a history entry. */
export function setParam(key: string, value: string | null) {
  const p = new URLSearchParams(location.search);
  if (value) p.set(key, value);
  else p.delete(key);
  const qs = p.toString();
  const url = location.pathname + (qs ? `?${qs}` : "") + location.hash;
  if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, "", url);
}

export const today = () => new Date().toISOString().slice(0, 10);

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
