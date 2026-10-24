# Product Hunt research trace

TechData has no hosted product-event analytics or AppHealth event sink. The
Product Hunt workflow therefore records an optional trace in the current page's
memory. It resets on reload or tab close and is available for local JSON export
only when the URL includes `fleet_qa=1`. That explicit marker labels the trace
`test`; every other visit stays `unclassified`.

The allowlisted events describe first-screen preview and full-catalog
readiness or failure, search result counts, result selection and detail inspection, and export
preparation versus a CSV/JSON download request. The trace does not contain
search text, product names, slugs, URLs, provider output, cookies, or visitor
identifiers. Download requested does not mean the browser saved a file. A
200-event cap records a dropped count and marks the trace incomplete when
events were omitted.

This local trace supports a consented browser check; it does not create a
hosted aggregate or represent a natural-user cohort. Browser fixtures and
`fleet_qa=1` traffic remain test evidence. Issue #29 stays open until a
privacy-safe outcome source supports a declared real-user observation window
and reconciled research outcomes.
