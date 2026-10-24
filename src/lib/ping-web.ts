// Drop-in browser log client for App Health. Zero dependencies, ~110 lines.
// Copy into a site (Astro landing, plain HTML, Vite app) and call:
//
//   import { createPingWeb } from './ping-web';
//   const ping = createPingWeb({ publicKey: 'ahk_pub_…', environment: 'production' });
//   ping('waitlist.joined', { title: email, props: { source: 'hero' } });
//
// Or let it wire itself: `createPingWeb({ publicKey, autoWire: true })` logs
//   - `form.submitted` for every <form> (with its id/name/action; never field values),
//   - `cta.clicked` for clicks on elements carrying data-log="event.name",
//   - `client.error` (level error) for uncaught errors and unhandled rejections.
//
// Public keys are created in the dashboard's Logs tab and pinned to your
// site's origin, so they are safe to ship in page JavaScript. Each call sends
// one text/plain POST (no CORS preflight); when the page is hiding it uses
// sendBeacon so the last events still arrive.

type Level = "debug" | "info" | "warn" | "error";
type Scalar = string | number | boolean | null | undefined;

interface PingWebOptions {
  level?: Level;
  title?: string;
  description?: string;
  icon?: string;
  props?: Record<string, Scalar>;
}

interface PingWebConfig {
  publicKey: string;
  environment?: string;
  endpoint?: string;
  /** Attach form, data-log click, and error listeners. Default false. */
  autoWire?: boolean;
}

export type PingWeb = (event: string, options?: PingWebOptions) => void;

const DEFAULT_ENDPOINT = "https://ingest.sassmaker.com/v1/logs";

function uuid(): string {
  return crypto.randomUUID();
}

function cleanProps(props: Record<string, Scalar> = {}): Record<string, Exclude<Scalar, undefined>> {
  const out: Record<string, Exclude<Scalar, undefined>> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) out[key] = typeof value === "string" ? value.slice(0, 500) : value;
  }
  return out;
}

function send(endpoint: string, body: string): void {
  const hiding = typeof document !== "undefined" && document.visibilityState === "hidden";
  if (hiding && typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }));
    return;
  }
  fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body,
    keepalive: true,
  }).catch(() => {
    /* fail open: logging must never break the page */
  });
}

function wireAuto(ping: PingWeb): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target as HTMLFormElement | null;
      if (form?.tagName !== "FORM") return;
      ping("form.submitted", {
        title: form.id || form.getAttribute("name") || form.getAttribute("action") || "form",
        props: { page: location.pathname },
      });
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      const target = (event.target as Element | null)?.closest?.("[data-log]");
      const name = target?.getAttribute("data-log");
      if (name)
        ping(name, {
          title: target?.textContent?.trim().slice(0, 120) || name,
          props: { page: location.pathname },
        });
    },
    true,
  );
  window.addEventListener("error", (event) => {
    ping("client.error", {
      level: "error",
      title: event.message?.slice(0, 200) || "error",
      props: { page: location.pathname },
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    ping("client.error", {
      level: "error",
      title: reason.slice(0, 200),
      props: { page: location.pathname, kind: "rejection" },
    });
  });
}

export function createPingWeb(config: PingWebConfig): PingWeb {
  const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
  const ping: PingWeb = (event, options = {}) => {
    const body = JSON.stringify({
      public_key: config.publicKey,
      batch_id: uuid(),
      schema_version: "v1",
      ...(config.environment ? { environment: config.environment } : {}),
      logs: [
        {
          log_id: uuid(),
          timestamp: Date.now(),
          event,
          level: options.level ?? "info",
          title: options.title,
          description: options.description,
          icon: options.icon,
          props: cleanProps(options.props),
        },
      ],
    });
    send(endpoint, body);
  };
  if (config.autoWire) wireAuto(ping);
  return ping;
}
