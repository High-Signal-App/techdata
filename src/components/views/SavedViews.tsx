import { Button } from "@saas-maker/ui/components/button";
import { Input } from "@saas-maker/ui/components/input";
import * as React from "react";
import { useSavedViews } from "../../lib/local-lists";
import { viewUrl } from "../../lib/views";

/** Height is identical on the server, at hydration and after storage loads. */
export default function SavedViews() {
  const { items, persistent, update } = useSavedViews();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  return (
    <section aria-label="saved views" className="flex h-48 flex-col gap-2">
      <h2 className="ui-case text-xs text-muted-foreground">saved views</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length ? (
          <ul className="space-y-2">
            {items.map((view) => {
              const href = viewUrl(view);
              return (
                <li key={href}>
                  {editing === href ? (
                    <form
                      className="flex flex-wrap gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!name.trim()) return;
                        update((views) => views.map((v) => (viewUrl(v) === href ? { ...v, name: name.trim() } : v)));
                        setEditing(null);
                      }}
                    >
                      <Input
                        autoFocus
                        className="h-8 min-w-0 w-full"
                        aria-label="rename view"
                        value={name}
                        maxLength={80}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                      <Button type="submit" size="xs" variant="outline">
                        save
                      </Button>
                      <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(null)}>
                        cancel
                      </Button>
                    </form>
                  ) : (
                    <>
                      <a className="block truncate text-sm hover:underline" href={href} title={view.name}>
                        {view.name}
                      </a>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label={`rename ${view.name}`}
                          onClick={() => {
                            setName(view.name);
                            setEditing(href);
                          }}
                        >
                          rename
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label={`delete ${view.name}`}
                          onClick={() => update((views) => views.filter((v) => viewUrl(v) !== href))}
                        >
                          delete
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">save a collection’s filters, sort and columns here.</p>
            <a className="inline-block text-xs underline underline-offset-4" href="/nomad/">
              explore places
            </a>
          </div>
        )}
      </div>
      {!persistent && (
        <p className="text-xs text-muted-foreground">storage unavailable · use copy link to keep views</p>
      )}
    </section>
  );
}
