import { ExportMenu } from "@saas-maker/ui/blocks/export-menu";
import { FilterBar, FilterSearch } from "@saas-maker/ui/blocks/filter-bar";
import { KeyValueList, Provenance, RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import { RecordDetailSkeleton } from "@saas-maker/ui/blocks/skeletons";
import type { DataColumn } from "@saas-maker/ui/components/data-table";
import { ErrorState } from "@saas-maker/ui/components/error-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@saas-maker/ui/components/select";
import * as React from "react";
import {
  FOOD_CATEGORIES,
  FOOD_SITE,
  type FoodEnvelope,
  type FoodProduct,
  type FoodProductPage,
} from "../../adapters/food";
import { pinFromColumns } from "../../lib/compare";
import { useFoodUsageRequest } from "../../lib/food-usage";
import { useJsonResource } from "../../lib/resource";
import { today, useUrlParam } from "../../lib/url-state";
import PinButton from "../views/PinButton";
import SaveView from "../views/SaveView";
import DataTable from "../views/ViewTable";

const PAGE_SIZE = 24;
function productsUrl(q: string | null, category: string | null, page = 1) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  return `/api/food/products?${params}`;
}

const productUrl = (id: string) => `/api/food/products/${encodeURIComponent(id)}`;

const amount = (value: number | null | undefined, unit: string) =>
  value == null ? null : `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${unit}`;
const basisLabel = (basis: string | null | undefined) =>
  ({ per_100g: "per 100 g", per_100ml: "per 100 ml", per_serving: "per serving" })[basis ?? ""] ??
  (basis || "basis not recorded");
const perBasis = (value: number | null | undefined, unit: string, basis: string | null | undefined) => {
  if (value == null) return "not recorded";
  if (basis === "per_100g") return `${amount(value, unit)} / 100 g`;
  if (basis === "per_100ml") return `${amount(value, unit)} / 100 ml`;
  if (basis === "per_serving") return `${amount(value, unit)} / serving`;
  return `${amount(value, unit)} · ${basisLabel(basis)}`;
};

export const foodProductColumns: DataColumn<FoodProduct>[] = [
  {
    id: "name",
    header: "product",
    value: (p) => p.name,
    hideable: false,
    minWidth: "14rem",
    cell: (p) => <span className="font-medium">{p.name}</span>,
  },
  { id: "brand", header: "brand", value: (p) => p.brand, className: "text-muted-foreground" },
  { id: "category", header: "category", value: (p) => p.category, className: "text-muted-foreground" },
  {
    id: "protein",
    header: "protein / basis",
    value: (p) =>
      p.nutrition?.proteinGrams == null ? null : perBasis(p.nutrition.proteinGrams, "g", p.nutrition.basis),
    cell: (p) => perBasis(p.nutrition?.proteinGrams, "g", p.nutrition?.basis),
  },
  {
    id: "calories",
    header: "energy / basis",
    value: (p) => (p.nutrition?.calories == null ? null : perBasis(p.nutrition.calories, "kcal", p.nutrition.basis)),
    cell: (p) => perBasis(p.nutrition?.calories, "kcal", p.nutrition?.basis),
  },
  {
    id: "nutritionStatus",
    header: "nutrition evidence",
    value: (p) => p.nutritionStatus,
    className: "text-muted-foreground",
  },
];

export default function FoodProductsView() {
  const [q, setQ] = useUrlParam("q");
  const [category, setCategory] = useUrlParam("category");
  const [pageParam, setPage] = useUrlParam("page");
  const [productId, setProductId] = useUrlParam("product");
  const [draft, setDraft] = React.useState(q ?? "");
  const searchUsage = useFoodUsageRequest("food.products_search_succeeded");
  const lookupUsage = useFoodUsageRequest("food.product_lookup_succeeded");
  React.useEffect(() => setDraft(q ?? ""), [q]);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const nextQuery = draft.trim() || null;
      if (nextQuery !== (q || null)) {
        if (nextQuery !== (q?.trim() || null)) {
          searchUsage.expectForInput(draft, nextQuery || category ? productsUrl(nextQuery, category) : null);
        }
        setQ(nextQuery);
        setPage(null);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, q, category, setQ, setPage, searchUsage]);

  const requested = Math.max(1, Number(pageParam ?? 1) || 1);
  const resource = useJsonResource<FoodEnvelope<FoodProductPage>>(
    productsUrl(q, category, requested),
    undefined,
    true,
    (response, url) => {
      if (Array.isArray(response?.data?.products)) searchUsage.complete(url);
    },
  );
  const detailResource = useJsonResource<FoodEnvelope<FoodProduct>>(
    productId ? productUrl(productId) : null,
    undefined,
    true,
    (response, url) => {
      if (typeof response?.data?.id === "string" && productUrl(response.data.id) === url) lookupUsage.complete(url);
    },
  );
  const data = resource.data?.data;
  const products = data?.products ?? [];
  const detail = detailResource.data?.data.id === productId ? detailResource.data : undefined;
  const selected = detail?.data ?? products.find((p) => p.id === productId);
  const pagination = data?.pagination;
  const listProvenance = resource.data?.provenance;
  const pin = React.useCallback(
    (product: FoodProduct) =>
      pinFromColumns(
        "/food/products/",
        product.id,
        product.name,
        product,
        foodProductColumns,
        detail?.data.id === product.id ? detail.provenance : listProvenance,
        "product",
        {},
        `${FOOD_SITE}/products/${encodeURIComponent(product.id)}`,
      ),
    [detail, listProvenance],
  );
  const selectedPin = selected ? pin(selected) : null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          Nutrition stays on its source basis: per 100 g, per 100 ml, or per serving. Blank fields are unknown.
        </span>
      </div>
      <FilterBar>
        <SaveView />
        {/* Cancel before the shared search input's debounced change callback. */}
        <div
          className="contents"
          onInputCapture={(event) => {
            if (event.target instanceof HTMLInputElement) searchUsage.noteInput(event.target.value, draft);
          }}
        >
          <FilterSearch value={draft} onChange={setDraft} placeholder="Product or brand…" />
        </div>
        <Select
          value={category ?? "all"}
          onValueChange={(v) => {
            const nextCategory = v === "all" ? null : v;
            if (nextCategory !== category) {
              searchUsage.expect(q || nextCategory ? productsUrl(q, nextCategory) : null);
            }
            setCategory(nextCategory);
            setPage(null);
          }}
        >
          <SelectTrigger size="sm" className="ui-case h-8 w-auto gap-1.5" aria-label="Product category">
            <SelectValue>{category?.replaceAll("_", " ") ?? "all categories"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all categories</SelectItem>
            {FOOD_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {value.replaceAll("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>
      <RecordLayout className="mt-3">
        <DataTable
          className="flex-1"
          label="packaged foods"
          pin={pin}
          data={products}
          columns={foodProductColumns}
          getRowId={(p) => p.id}
          status={resource.status === "error" ? "error" : resource.status === "loading" ? "loading" : "ready"}
          error={
            resource.error?.message === "invalid_food_query"
              ? "Try a shorter search or select a supported filter."
              : "The Food public API did not answer."
          }
          onRetry={resource.retry}
          empty="No packaged foods match these filters."
          onRowClick={(p) => {
            if (p.id !== productId) lookupUsage.expect(productUrl(p.id));
            setProductId(p.id);
          }}
          selectedId={productId}
          pageSize={PAGE_SIZE}
          manual={{
            rowCount: pagination?.total ?? 0,
            page: requested - 1,
            onPageChange: (n) => {
              searchUsage.expect(null);
              setPage(n ? String(n + 1) : null);
            },
          }}
          toolbar={() => (
            <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
                {pagination ? (
                  <>
                    <span className="text-foreground">{pagination.total.toLocaleString("en-US")}</span> products · page{" "}
                    {pagination.page} of {Math.max(1, pagination.pages)}
                  </>
                ) : (
                  "loading products…"
                )}
              </p>
              {data && products.length > 0 && (
                <ExportMenu
                  rows={products}
                  columns={foodProductColumns.map((c) => ({ id: c.id, value: c.value }))}
                  filename={`food-products-${today()}`}
                  meta={{ collection: "food", ...resource.data?.provenance, page: requested }}
                />
              )}
            </div>
          )}
        />
        <RecordDetail
          open={!!productId}
          onOpenChange={(open) => {
            if (open) return;
            lookupUsage.expect(null);
            setProductId(null);
          }}
          title={selected?.name ?? "packaged food"}
          subtitle={selected?.brand ?? undefined}
          className="lg:w-[28rem]"
        >
          {productId && detailResource.status === "loading" && !selected && (
            <RecordDetailSkeleton className="border-0 rounded-none max-w-none" />
          )}
          {productId && detailResource.status === "error" && !selected && (
            <ErrorState title="this product did not load." description={null} onRetry={detailResource.retry} />
          )}
          {selected && (
            <>
              <KeyValueList
                items={[
                  { label: "category", value: selected.category },
                  { label: "serving size", value: amount(selected.servingSizeGrams, "g") ?? "not recorded" },
                  { label: "net quantity", value: amount(selected.netQuantityGrams, "g") },
                  { label: "nutrition basis", value: basisLabel(selected.nutrition?.basis) },
                  {
                    label: "protein",
                    value: perBasis(selected.nutrition?.proteinGrams, "g", selected.nutrition?.basis),
                  },
                  {
                    label: "calories",
                    value: perBasis(selected.nutrition?.calories, "kcal", selected.nutrition?.basis),
                  },
                  { label: "sugar", value: perBasis(selected.nutrition?.sugarGrams, "g", selected.nutrition?.basis) },
                  { label: "fibre", value: perBasis(selected.nutrition?.fibreGrams, "g", selected.nutrition?.basis) },
                  { label: "nutrition status", value: selected.nutritionStatus ?? "not recorded" },
                  { label: "ingredients status", value: selected.ingredientStatus ?? "not recorded" },
                  { label: "observed", value: selected.nutrition?.observedAt ?? "not recorded" },
                  { label: "label verified", value: selected.nutrition?.labelVerifiedAt ?? "not verified" },
                ]}
              />
              <a
                className="text-sm underline underline-offset-4"
                href={`https://food.significanthobbies.com/products/${encodeURIComponent(selected.id)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                open Food product record
              </a>
              <a
                className="text-sm underline underline-offset-4"
                href={`https://food.significanthobbies.com/api/products/${encodeURIComponent(selected.id)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                open source product JSON
              </a>
              {selected.nutritionEvidenceUrl && (
                <a
                  className="text-sm underline underline-offset-4"
                  href={selected.nutritionEvidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  nutrition evidence source
                </a>
              )}
              <Provenance
                info={{
                  source: "Significant Hobbies Food",
                  url: `https://food.significanthobbies.com/api/products/${encodeURIComponent(selected.id)}`,
                  via: "public read-only API",
                  viaUrl:
                    detailResource.data?.provenance.viaUrl ??
                    resource.data?.provenance.viaUrl ??
                    "https://food.significanthobbies.com/api/products",
                  readAt: detailResource.data?.provenance.fetchedAt ?? resource.data?.provenance.fetchedAt,
                  note: detailResource.data?.provenance.note ?? resource.data?.provenance.note,
                }}
              />
              <p className="text-xs text-muted-foreground">
                A serving size is separate from per-100-g, per-100-ml, or per-serving nutrition. Missing or unverified
                values remain unknown.
              </p>
              {selectedPin && <PinButton item={selectedPin} />}
            </>
          )}
        </RecordDetail>
      </RecordLayout>
    </>
  );
}
