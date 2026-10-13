import type { ClientDirective } from "astro";

/** The closed palette has no visible work; hydrate when its existing trigger is used. */
const search: ClientDirective = (load, _options, island) => {
  let loading = false;
  const start = async () => {
    if (loading) return;
    loading = true;
    island.dataset.searchRequested = "true";
    try {
      const hydrate = await load();
      await hydrate();
      document.removeEventListener("click", click);
      window.removeEventListener("keydown", key);
      window.removeEventListener("sm:search-open", start);
    } catch {
      // A failed chunk load can be retried with the same trigger.
      loading = false;
    }
  };
  const click = (event: MouseEvent) => {
    if ((event.target as Element | null)?.closest?.("[data-search-trigger]")) void start();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
      event.preventDefault();
      void start();
    }
  };
  document.addEventListener("click", click);
  window.addEventListener("keydown", key);
  window.addEventListener("sm:search-open", start);
};
export default search;
