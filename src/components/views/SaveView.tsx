import { Button } from "@saas-maker/ui/components/button";
import { Input } from "@saas-maker/ui/components/input";
import * as React from "react";
import { useSavedViews } from "../../lib/local-lists";
import { dedupeViews, isViewPath, MAX_VIEWS, validateView, viewUrl } from "../../lib/views";

export default function SaveView() {
  const { items, update, persistent } = useSavedViews();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState("");
  const [notice, setNotice] = React.useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {editing ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const view = validateView({ name, collection: location.pathname, query: location.search });
            if (!view) return;
            if (items.length >= MAX_VIEWS && !items.some((v) => viewUrl(v) === viewUrl(view))) {
              setNotice("saved views full · delete a view first");
              return;
            }
            update((items) => dedupeViews([...items, view]));
            setEditing(false);
            setName("");
            setNotice("view saved");
          }}
        >
          <Input
            autoFocus
            aria-label="view name"
            placeholder="view name"
            maxLength={80}
            value={name}
            className="h-8 w-40"
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Button size="sm" type="submit" disabled={!name.trim()}>
            save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            cancel
          </Button>
        </form>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditing(true);
            setNotice("");
          }}
        >
          save view
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          if (!isViewPath(location.pathname)) return;
          const link = location.origin + viewUrl({ collection: location.pathname, query: location.search });
          try {
            await navigator.clipboard.writeText(link);
            setNotice("link copied");
          } catch {
            setNotice(`copy link: ${link}`);
          }
        }}
      >
        copy link
      </Button>
      <span role="status" className="text-xs text-muted-foreground break-all">
        {notice}
        {!persistent && " · storage unavailable; copy link to keep this view"}
      </span>
    </div>
  );
}
