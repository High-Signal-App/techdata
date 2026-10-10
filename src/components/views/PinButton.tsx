import { Button } from "@saas-maker/ui/components/button";
import { MAX_PINS, type PinnedItem, pinKey } from "../../lib/compare";
import { usePins } from "../../lib/local-lists";

export default function PinButton({ item }: { item: PinnedItem | null }) {
  const { items, update } = usePins();
  if (!item) return null;
  const pinned = items.some((p) => pinKey(p) === pinKey(item));
  return (
    <Button
      variant={pinned ? "secondary" : "outline"}
      size="sm"
      disabled={!pinned && items.length >= MAX_PINS}
      onClick={() => update((old) => (pinned ? old.filter((p) => pinKey(p) !== pinKey(item)) : [...old, item]))}
    >
      {pinned ? "unpin" : "pin to compare"}
    </Button>
  );
}
