import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import SavedViews from "../src/components/views/SavedViews";

it("offers a usable collection route before storage or hydration is available", () => {
  const html = renderToStaticMarkup(createElement(SavedViews));
  expect(html).toContain('href="/nomad/"');
  expect(html).toContain("explore places");
  expect(html).toContain("save a collection’s filters, sort and columns here.");
  expect(html).toContain("h-48");
});
