# PH Catalog sample

Source: Product Hunt public product pages, catalogue by Significant-Hobbies/ph-catalog.
Release: [Catalogue handoff v1](https://github.com/Significant-Hobbies/ph-catalog/releases/tag/catalog-handoff-v1), published 2026-08-31.
Sample date: 2026-10-09. `sample.parquet` is a real deterministic 2,000-product
subset of the 574,752-product export, hash-ordered by slug with spam/contact-detail
rows filtered out. Seven source fields are preserved; categories is VARCHAR[].
The sample is retained only as a test fixture; the app reads the full export from private R2.
Record collection dates, votes and launch dates are not present in this export.

`rows.json` contains the first five supplied sample rows ordered by slug, extracted
locally with DuckDB for offline query-contract tests (same source/date as above).
