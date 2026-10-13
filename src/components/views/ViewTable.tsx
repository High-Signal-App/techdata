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

const numbers = new Intl.NumberFormat("en-US");

/** Library visibility is internal; initialise it from the URL and observe its toolbar view. */
export default function ViewTable<T extends object>(
  props: React.ComponentProps<typeof DataTable<T>> & {
    pin?: (row: T) => PinnedItem | null;
    initialColumns?: string | null;
  },
) {
  const [columnsParam] = useUrlParam("columns", props.initialColumns ?? null);
  const { items, update } = usePins();
  const { pin, toolbar, columns, initialColumns: _initialColumns, ...rest } = props;
  const requested = columnsParam === null ? null : new Set(columnsParam.split(","));
  const visibility = JSON.stringify(
    columns.filter((c) => c.hideable === false || (requested ? requested.has(c.id) : !c.hidden)).map((c) => c.id),
  );
  const initial = React.useMemo(() => {
    const visible = new Set<string>(JSON.parse(visibility));
    return columns.map((c) => ({
      ...c,
      // Keep the initial HTML and browser locale identical for numeric cells.
      cell:
        c.cell ??
        ((row: T) => {
          const value = c.value(row);
          return typeof value === "number" ? (
            numbers.format(value)
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
      hidden: !visible.has(c.id),
    }));
  }, [columns, visibility]);
  const projected = React.useMemo(
    () =>
      pin
        ? props.data.flatMap((row) => {
            const item = pin(row);
            return item ? [{ rowId: props.getRowId(row), item }] : [];
          })
        : [],
    [pin, props.data, props.getRowId],
  );
  const pinLabels = new Map(projected.map(({ rowId, item }) => [rowId, item.title]));
  const selected = projected.filter(({ item }) => items.some((p) => pinKey(p) === pinKey(item))).map((p) => p.rowId);
  const loading = props.loading || props.status === "loading";
  return (
    <div className={`resource-table ${props.className ?? ""}`}>
      {loading ? (
        <DataTableSkeleton
          columns={initial.filter((c) => !c.hidden)}
          rows={props.skeletonRows ?? 20}
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
          key={visibility}
          selection={
            props.selection ??
            (pin
              ? {
                  selected,
                  rowLabel: (row) => pinLabels.get(props.getRowId(row)) ?? props.getRowId(row),
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
              <ColumnUrl columns={view.columns} />
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
    // The parent first reads an explicit URL view in its mount effect. Writing
    // sooner would replace that requested view with the server's defaults.
    const frame = requestAnimationFrame(() => setParam("columns", value));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return null;
}
