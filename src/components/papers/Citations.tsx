import * as React from "react";
import { formatDate } from "../../lib/url-state";

export type CitationGraph = {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  note: string;
  papers: Record<
    string,
    {
      title: string;
      status: "matched" | "unmatched" | "ambiguous";
      openalex: string | null;
      references: string[];
      citedBy: string[];
    }
  >;
};

/** Module is small; the data request starts only when a paper detail mounts. */
let graphRequest: Promise<CitationGraph> | undefined;
export default function Citations({ id }: { id: string }) {
  const [graph, setGraph] = React.useState<CitationGraph | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let current = true;
    graphRequest ??= fetch("/data/papers/citations.json")
      .then((response) => {
        if (!response.ok) throw new Error("Citation snapshot unavailable");
        return response.json() as Promise<CitationGraph>;
      })
      .catch((error) => {
        graphRequest = undefined;
        throw error;
      });
    graphRequest
      .then((value) => {
        if (current) setGraph(value);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, []);
  if (!graph)
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {failed ? "The OpenAlex citation snapshot did not load." : "Loading citations within this collection…"}
      </p>
    );
  return <CitationLists id={id} graph={graph} />;
}

export function CitationLists({ id, graph }: { id: string; graph: CitationGraph }) {
  const paper = graph.papers[id];
  return (
    <section className="space-y-4">
      {paper?.status === "matched" ? (
        (["references", "citedBy"] as const).map((direction) => (
          <section key={direction}>
            <h3 className="ui-case mb-2 text-xs text-muted-foreground">
              {direction === "references" ? "references within this collection" : "cited by within this collection"}
            </h3>
            {paper[direction].length ? (
              <ul className="space-y-2 text-sm">
                {paper[direction].map((other) => (
                  <li key={other}>
                    <a className="underline underline-offset-4" href={`/papers/?paper=${encodeURIComponent(other)}`}>
                      {graph.papers[other].title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None recorded in this snapshot.</p>
            )}
          </section>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          {paper?.status === "ambiguous"
            ? "OpenAlex returned conflicting identifier matches; citation lists are unavailable."
            : "No verified OpenAlex identifier match in this snapshot."}
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        <a className="underline underline-offset-4" href={paper?.openalex ?? graph.sourceUrl}>
          {graph.source}
        </a>
        {" · fetched "}
        {formatDate(graph.fetchedAt)}
        {". "}
        {graph.note}
      </p>
    </section>
  );
}
