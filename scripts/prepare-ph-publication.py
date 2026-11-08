"""Prepare public product metadata once, never during a crawler request.

Run: uv run --with duckdb python scripts/prepare-ph-publication.py <public parquet>
Input is the already-public allowlisted PH export; no collector/private storage access.
"""

import hashlib
import html
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import duckdb

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/data/ph/publication"
REVISION = "catalog-state-2026-10-10"


def text(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value or ""))).strip()


def shard(slug):
    value = 2166136261
    for char in slug.encode("utf-8"):
        value = ((value ^ char) * 16777619) & 0xFFFFFFFF
    return f"{value % 256:02x}"


def safe_url(value, host=None):
    try:
        parsed = urlparse(value or "")
        return value if parsed.scheme in ("https", "http") and parsed.hostname and not parsed.username and (not host or parsed.hostname in host) else None
    except ValueError:
        return None


def main():
    source = sys.argv[1]
    db = duckdb.connect()
    rows = db.execute("SELECT * FROM read_parquet(?) ORDER BY slug", [source])
    columns = [field[0] for field in rows.description]
    eligible = []
    total = 0
    for values in rows.fetchall():
        total += 1
        row = dict(zip(columns, values))
        slug = row["slug"]
        name = text(row["name"])
        description = text(row["description"])
        categories = sorted(set(text(c) for c in (row["categories"] or []) if text(c)))
        source_url = safe_url(row["producthunt_url"], {"www.producthunt.com", "producthunt.com"})
        # A real source description, category context and source identity are required.
        # No count target, inferred features, generated descriptions or collection dates.
        if not (isinstance(slug, str) and re.fullmatch(r"[a-z0-9][a-z0-9-]*", slug) and name and source_url and categories and len(description) >= 160 and len(description.split()) >= 25):
            continue
        eligible.append({"slug": slug, "name": name, "tagline": text(row["tagline"]), "description": description[:3000], "descriptionExcerpt": len(description) > 3000, "categories": categories, "website_url": safe_url(row["website_url"]), "producthunt_url": source_url})
    if total != 575479:
        raise ValueError(f"Unexpected source record count: {total}")
    if len({row["slug"] for row in eligible}) != len(eligible):
        raise ValueError("Duplicate product slugs would create ambiguous public URLs")
    categories = {}
    for row in eligible:
        for category in row["categories"]:
            categories.setdefault(category, []).append(row)
    for index, row in enumerate(eligible):
        row["catalogPage"] = index // 100 + 1
        related = {}
        for category in row["categories"]:
            for other in categories[category][:6]:
                if other["slug"] != row["slug"] and other["slug"] not in related:
                    related[other["slug"]] = {"slug": other["slug"], "name": other["name"], "category": category}
                if len(related) == 4:
                    break
            if len(related) == 4:
                break
        row["related"] = list(related.values())
    OUT.mkdir(parents=True, exist_ok=True)
    def write(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    groups = {f"{n:02x}": [] for n in range(256)}
    for row in eligible:
        groups[shard(row["slug"])].append(row)
    for key, group in groups.items():
        write(OUT / f"products/{key}.json", group)
    page_size = 100
    pages = (len(eligible) + page_size - 1) // page_size
    for offset in range(0, len(eligible), page_size):
        write(OUT / f"catalog/{offset // page_size + 1}.json", [{k: row[k] for k in ("slug", "name", "tagline", "categories")} for row in eligible[offset:offset + page_size]])
    urls = [f"/ph/products/{row['slug']}/" for row in eligible] + [f"/ph/catalog/{n}/" for n in range(1, pages + 1)]
    chunks = []
    for offset in range(0, len(urls), 5000):
        key = f"ph-{offset // 5000 + 1}"
        write(OUT / f"sitemaps/{key}.json", urls[offset:offset + 5000])
        chunks.append(key)
    manifest = {"revision": REVISION, "exportedAt": "2026-10-10", "sourceRecords": total, "products": len(eligible), "catalogPages": pages, "sitemapChunks": chunks, "sourceUrl": "https://data.highsignal.app/api/files/ph/producthunt-full.parquet", "sourceSha256": hashlib.sha256(Path(source).read_bytes()).hexdigest(), "admission": "Valid source URL and stable slug; nonempty name and categories; plain-text source description of at least 160 characters and 25 words. Source descriptions are limited to 3,000 characters and labelled when excerpted."}
    write(ROOT / "src/generated/ph-publication.json", manifest)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
