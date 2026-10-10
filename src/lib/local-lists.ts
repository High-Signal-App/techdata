import * as React from "react";
import { PINS_KEY, type PinnedItem, readPins } from "./compare";
import { readViews, type SavedView, VIEWS_KEY } from "./views";

/** One store per key across islands. Fall back to session storage, then memory. */
function localList<T>(key: string, parse: (raw: string | null) => T[]) {
  const empty: T[] = [];
  let snapshot = { items: empty, persistent: true };
  const server = snapshot;
  let loaded = false;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const init = () => {
    if (loaded) return;
    loaded = true;
    let session: string | null = null;
    try {
      session = sessionStorage.getItem(key);
    } catch {
      /* memory is still usable */
    }
    try {
      snapshot = { items: parse(session ?? localStorage.getItem(key)), persistent: session === null };
    } catch {
      snapshot = { items: parse(session), persistent: false };
    }
    addEventListener("storage", (e) => {
      if (e.key !== key && e.key !== null) return;
      snapshot = { items: parse(e.key === null ? null : e.newValue), persistent: snapshot.persistent };
      emit();
    });
    emit();
  };
  const update = (change: (items: T[]) => T[]) => {
    init();
    const items = parse(JSON.stringify(change(snapshot.items)));
    let persistent = snapshot.persistent;
    try {
      localStorage.setItem(key, JSON.stringify(items));
      persistent = true;
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* optional fallback */
      }
    } catch {
      persistent = false;
      try {
        sessionStorage.setItem(key, JSON.stringify(items));
      } catch {
        /* keep the in-memory list */
      }
    }
    snapshot = { items, persistent };
    emit();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return function useList() {
    const value = React.useSyncExternalStore(
      subscribe,
      () => snapshot,
      () => server,
    );
    React.useEffect(init, []);
    return { ...value, update };
  };
}
export const useSavedViews = localList<SavedView>(VIEWS_KEY, readViews);
export const usePins = localList<PinnedItem>(PINS_KEY, readPins);
