import {
  type DataColumn,
  DataTable,
  DataTableSkeleton,
  type DataTableView,
} from "@saas-maker/ui/components/data-table";
import { EmptyState } from "@saas-maker/ui/components/empty-state";
import { ErrorState } from "@saas-maker/ui/components/error-state";
import * as React from "react";
import { type PinnedItem, pinKey } from "../../lib/compare";
import { usePins } from "../../lib/local-lists";
import { setParam, useUrlParam } from "../../lib/url-state";

/** Library visibility is internal; initialise it from the URL and observe its toolbar view. */
export default function ViewTable<T extends object>(
  props: React.ComponentProps<typeof DataTable<T>> & {
    pin?: (row: T) => PinnedItem | null;
  },
) {
  const [columnsParam] = useUrlParam("columns");
  const [mounted, mount] = React.useState(false);
  React.useEffect(() => mount(true), []);
  const { items, update } = usePins();
  const { pin, toolbar, columns, ...rest } = props;
  const visible = columnsParam === null ? null : new Set(columnsParam.split(","));
  const initial = columns.map((c) => ({
    ...c,
    // Keep the initial HTML and browser locale identical for numeric cells.
    cell:
      c.cell ??
      ((row: T) => {
        const value = c.value(row);
        return typeof value === "number" ? (
          value.toLocaleString("en-US")
        ) : value == null || value === "" ? (
          <span className="text-muted-foreground/60">—</span>
        ) : typeof value === "boolean" ? (
          value ? (
            "yes"
          ) : (
            "no"
          )
        ) : (
          value
        );
      }),
    hidden: c.hideable === false ? false : visible ? !visible.has(c.id) : c.hidden,
  }));
  const projected = pin
    ? props.data.flatMap((row) => {
        const item = pin(row);
        return item ? [{ rowId: props.getRowId(row), item }] : [];
      })
    : [];
  const selected = projected.filter(({ item }) => items.some((p) => pinKey(p) === pinKey(item))).map((p) => p.rowId);
  const loading = props.loading || props.status === "loading";
  return (
    <div className={`resource-table ${props.className ?? ""}`}>
      {loading ? (
        <DataTableSkeleton
          columns={initial.filter((c) => !c.hidden)}
          rows={props.skeletonRows ?? 50}
          selection={!!(pin || props.selection)}
          label={props.label}
          maxHeight={props.maxHeight}
        />
      ) : (
        <DataTable
          {...rest}
          status="ready"
          data={props.status === "error" ? [] : props.data}
          empty={
            props.status === "error" ? (
              typeof props.error !== "string" && props.error ? (
                props.error
              ) : (
                <ErrorState
                  title={typeof props.error === "string" ? props.error.toLowerCase() : "this view could not load."}
                  description={null}
                  onRetry={props.onRetry}
                />
              )
            ) : (
              <EmptyState
                title={typeof props.empty === "string" ? props.empty.toLowerCase() : "nothing matches."}
                description={typeof props.empty === "string" ? undefined : props.empty}
              />
            )
          }
          columns={initial}
          key={mounted ? columnsParam : "server"}
          selection={
            props.selection ??
            (pin
              ? {
                  selected,
                  rowLabel: (row) => pin(row)?.title ?? props.getRowId(row),
                  onChange: (ids) =>
                    update((old) => {
                      const removed = projected
                        .filter((p) => selected.includes(p.rowId) && !ids.includes(p.rowId))
                        .map((p) => pinKey(p.item));
                      const added = projected
                        .filter((p) => ids.includes(p.rowId) && !selected.includes(p.rowId))
                        .map((p) => p.item);
                      return [...old.filter((p) => !removed.includes(pinKey(p))), ...added];
                    }),
                }
              : undefined)
          }
          toolbar={(view) => (
            <>
              {mounted && <ColumnUrl columns={view.columns} />}
              {props.status !== "error" && toolbar?.(view)}
            </>
          )}
        />
      )}
    </div>
  );
}
function ColumnUrl<T>({ columns }: Pick<DataTableView<T>, "columns">) {
  const value = columns.map((c: DataColumn<T>) => c.id).join(",");
  React.useEffect(() => {
    setParam("columns", value);
  }, [value]);
  return null;
}
