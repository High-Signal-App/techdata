/** JSON in an HTML script element must never contain an HTML tag opener. */
export function serializeJsonLd(value: Record<string, unknown>) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
