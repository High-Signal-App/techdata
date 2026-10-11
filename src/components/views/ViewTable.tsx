import { type DataColumn, DataTable, type DataTableView } from "@saas-maker/ui/components/data-table";
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
  return (
    <DataTable
      {...rest}
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
          {toolbar?.(view)}
        </>
      )}
    />
  );
}
function ColumnUrl<T>({ columns }: Pick<DataTableView<T>, "columns">) {
  const value = columns.map((c: DataColumn<T>) => c.id).join(",");
  React.useEffect(() => {
    setParam("columns", value);
  }, [value]);
  return null;
}
