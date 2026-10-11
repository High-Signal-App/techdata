import { createResourceClient, resourceClient, useResource } from "@saas-maker/ui/lib/use-resource";
import { useId, useMemo } from "react";

/** Preserve HTTP status so useResource retries network/5xx failures, never 4xx. */
export async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    // Do not restore a known missing/removed public record on a later navigation.
    if (response.status >= 400 && response.status < 500 && typeof window !== "undefined")
      resourceClient.invalidate(url);
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw Object.assign(new Error(typeof body?.error === "string" ? body.error : "unavailable"), {
      status: response.status,
    });
  }
  return response.json() as Promise<T>;
}

/** Null skips a dependent request; server renders use an isolated cache. */
export function useJsonResource<T>(url: string | null, initialData?: T, persist = true) {
  const disabled = useId();
  const isolated = useMemo(createResourceClient, []);
  const client = typeof window === "undefined" || url === null ? isolated : resourceClient;
  // Restore persistence before seeding initialData; the library otherwise prefers
  // the server seed over a fresher session entry on a full-page revisit.
  if (url && persist && typeof window !== "undefined") {
    const entry = client.entry<T>(url, { persist: { ttl: 300_000 } });
    if (entry.snapshot.data === undefined && initialData !== undefined) client.mutate(url, initialData);
  }
  return useResource<T>(url ?? `disabled:${disabled}`, (signal) => fetchJson<T>(url as string, signal), {
    initialData,
    client,
    staleTime: url === null ? Infinity : 0,
    ...(persist && url !== null ? { persist: { ttl: 300_000 } } : {}),
  });
}
