import { Button } from "@saas-maker/ui/components/button";
import { MAX_PINS, pinKey } from "../../lib/compare";
import { usePins } from "../../lib/local-lists";

export default function CompareTray() {
  const { items, update, persistent } = usePins();
  return (
    <section
      aria-label="compare tray"
      className="mt-6 flex min-h-10 flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground"
    >
      <a href="/compare/" className="text-sm text-foreground hover:underline">
        compare tray · {items.length}/{MAX_PINS}
      </a>
      {items.length ? (
        <>
          {items.map((item) => (
            <Button
              key={pinKey(item)}
              variant="ghost"
              size="xs"
              className="max-w-48"
              aria-label={`unpin ${item.title}`}
              onClick={() => update((old) => old.filter((p) => pinKey(p) !== pinKey(item)))}
            >
              <span className="truncate">{item.title}</span>
              <span aria-hidden>×</span>
            </Button>
          ))}
          <Button size="xs" variant="ghost" onClick={() => update(() => [])}>
            clear pins
          </Button>
        </>
      ) : (
        <span>select rows or pin a record to compare collections.</span>
      )}
      {!persistent && <span role="status">storage unavailable · pins may not survive navigation</span>}
      {items.length >= MAX_PINS && <span role="status">tray full · unpin an item to add another</span>}
    </section>
  );
}
