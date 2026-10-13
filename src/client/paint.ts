import type { ClientDirective } from "astro";

/** Paint the real server-rendered view before loading its interactive controls. */
const paint: ClientDirective = async (load) => {
  await document.fonts.ready;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const hydrate = await load();
  await hydrate();
};
export default paint;
