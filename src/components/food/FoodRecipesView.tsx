import { FilterBar, FilterSearch } from "@saas-maker/ui/blocks/filter-bar";
import { KeyValueList, Provenance, RecordDetail, RecordLayout } from "@saas-maker/ui/blocks/record-detail";
import { RecordDetailSkeleton } from "@saas-maker/ui/blocks/skeletons";
import { EmptyState } from "@saas-maker/ui/components/empty-state";
import { ErrorState } from "@saas-maker/ui/components/error-state";
import * as React from "react";
import type { FoodEnvelope, FoodRecipe, FoodRecipePage } from "../../adapters/food";
import { useJsonResource } from "../../lib/resource";
import { useUrlParam } from "../../lib/url-state";
import SaveView from "../views/SaveView";

function recipeQuery(q: string | null, dietary: string | null) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (dietary) params.set("dietary", dietary);
  return params.toString();
}

export default function FoodRecipesView() {
  const [q, setQ] = useUrlParam("q");
  const [dietary, setDietary] = useUrlParam("dietary");
  const [recipeId, setRecipeId] = useUrlParam("recipe");
  const [draft, setDraft] = React.useState(q ?? "");
  React.useEffect(() => setDraft(q ?? ""), [q]);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if ((draft.trim() || null) !== (q || null)) setQ(draft.trim() || null);
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, q, setQ]);

  const search = recipeQuery(q, dietary);
  const resource = useJsonResource<FoodEnvelope<FoodRecipePage>>(`/api/food/recipes${search ? `?${search}` : ""}`);
  const recipes = resource.data?.data.recipes ?? [];
  const selected = recipes.find((recipe) => recipe.id === recipeId);

  if (resource.status === "loading" && !resource.data)
    return <RecordDetailSkeleton fields={6} className="max-w-none" />;
  if (resource.status === "error" && !resource.data)
    return <ErrorState title="the Food public API did not answer." description={null} onRetry={resource.retry} />;

  return (
    <>
      <p className="mb-3 text-xs text-muted-foreground">
        Recipes are source-linked. Nutrition values describe the source's stated serving; they are not normalized to 100
        g or 100 ml.
      </p>
      <FilterBar>
        <SaveView />
        <FilterSearch value={draft} onChange={setDraft} placeholder="Recipe, ingredient, or publisher…" />
        <fieldset className="flex gap-1" aria-label="Dietary filter">
          <legend className="sr-only">Dietary filter</legend>
          {([null, "vegetarian", "vegan"] as const).map((value) => (
            <button
              key={value ?? "all"}
              type="button"
              aria-pressed={(dietary || null) === value}
              className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted aria-pressed:bg-secondary aria-pressed:text-foreground"
              onClick={() => setDietary(value)}
            >
              {value ?? "all recipes"}
            </button>
          ))}
        </fieldset>
      </FilterBar>
      <RecordLayout className="mt-3">
        <section aria-label="vegetarian recipe results" className="min-w-0 flex-1">
          {resource.status === "error" && (
            <ErrorState
              title="recipes could not refresh."
              description="The last results remain available."
              onRetry={resource.retry}
            />
          )}
          {!recipes.length && resource.status !== "error" ? (
            <EmptyState title="no recipes match." description="Try a broader ingredient or clear the dietary filter." />
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {recipes.map((recipe) => (
                <li key={recipe.id}>
                  <button
                    type="button"
                    className="grid w-full gap-1 py-3 text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                    aria-pressed={recipeId === recipe.id}
                    onClick={() => setRecipeId(recipe.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{recipe.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {recipe.publisher ?? "publisher not recorded"} ·{" "}
                        {recipe.dietary ?? "dietary label not recorded"} · {recipe.indiaFit ?? "India fit not recorded"}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {recipe.nutrition?.protein == null
                        ? "protein not recorded"
                        : `${recipe.nutrition.protein} g protein`}{" "}
                      {recipe.nutrition?.servingBasis ? `· ${recipe.nutrition.servingBasis}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <RecordDetail
          open={!!recipeId}
          onOpenChange={(open) => !open && setRecipeId(null)}
          title={selected?.title ?? "recipe"}
          subtitle={selected?.publisher ?? undefined}
          className="lg:w-[28rem]"
        >
          {selected && resource.data && <RecipeDetail recipe={selected} info={resource.data.provenance} />}
        </RecordDetail>
      </RecordLayout>
    </>
  );
}

function RecipeDetail({ recipe, info }: { recipe: FoodRecipe; info: FoodEnvelope<FoodRecipePage>["provenance"] }) {
  return (
    <>
      <KeyValueList
        items={[
          { label: "dietary", value: recipe.dietary ?? "not recorded" },
          { label: "format", value: recipe.format ?? "not recorded" },
          { label: "India fit", value: recipe.indiaFit ?? "not recorded" },
          { label: "ingredients", value: recipe.ingredients.length ? recipe.ingredients.join(", ") : "not recorded" },
          {
            label: "protein sources",
            value: recipe.proteinSources.length ? recipe.proteinSources.join(", ") : "not recorded",
          },
          {
            label: "protein",
            value:
              recipe.nutrition?.protein == null ? "not recorded" : `${recipe.nutrition.protein} g per stated serving`,
          },
          {
            label: "calories",
            value:
              recipe.nutrition?.calories == null
                ? "not recorded"
                : `${recipe.nutrition.calories} kcal per stated serving`,
          },
          { label: "serving basis", value: recipe.nutrition?.servingBasis ?? "not recorded" },
          { label: "nutrition note", value: recipe.nutrition?.sourceNote ?? "not recorded" },
        ]}
      />
      {recipe.indiaFitNote && <p className="text-sm text-muted-foreground">{recipe.indiaFitNote}</p>}
      <a className="text-sm underline underline-offset-4" href={recipe.url} target="_blank" rel="noopener noreferrer">
        open publisher recipe
      </a>
      <Provenance
        info={{
          source: "Significant Hobbies Food",
          url: recipe.url,
          via: "public read-only API",
          viaUrl: info.viaUrl,
          readAt: info.fetchedAt,
          note: info.note,
        }}
      />
    </>
  );
}
