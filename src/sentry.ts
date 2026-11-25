/**
 * Lightweight Sentry Envelope error reporter for the Bun server.
 * Sends unhandled exceptions directly to Sentry's ingest endpoint without
 * loading the full Node/OpenTelemetry SDK (~38 MiB private RSS saved).
 */
export interface SentryConfig {
  dsn?: string;
  environment?: string;
  release?: string;
  transport?: (
    endpoint: string,
    headers: Record<string, string>,
    body: string,
  ) => Promise<unknown>;
}

interface ParsedDsn {
  dsn: string;
  endpoint: string;
  key: string;
}

export interface StackFrame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

const maxInFlight = 8;
const stackLinePattern =
  /^\s*at\s+(?:(?:async\s+)?(.+?)\s+\((.+?)(?::(\d+))?(?::(\d+))?\)|(.+?)(?::(\d+))?(?::(\d+))?)\s*$/;

function parseDsn(raw: string | undefined): ParsedDsn | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const key = url.username;
    const project = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!key || !project || !/^\d+$/.test(project)) return null;
    return {
      dsn: raw,
      endpoint: `${url.origin}/api/${project}/envelope/`,
      key,
    };
  } catch {
    return null;
  }
}

export function parseStackFrames(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const line of stack.split("\n")) {
    const match = stackLinePattern.exec(line);
    if (!match) continue;
    const fn = match[1] || "<anonymous>";
    const filename = match[2] || match[5];
    if (!filename) continue;
    const lineno = match[3] || match[6];
    const colno = match[4] || match[7];
    const frame: StackFrame = {
      filename,
      function: fn,
      in_app:
        !filename.includes("/node_modules/") &&
        !filename.startsWith("node:") &&
        !filename.startsWith("bun:") &&
        filename !== "native",
    };
    if (lineno) frame.lineno = Number(lineno);
    if (colno) frame.colno = Number(colno);
    frames.push(frame);
  }
  // Sentry expects frames ordered from oldest caller to innermost throw site.
  return frames.reverse();
}

export function buildExceptionEnvelope(
  error: unknown,
  parsed: ParsedDsn,
  environment: string,
  release: string | undefined,
) {
  const eventId = crypto.randomUUID().replaceAll("-", "");
  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : String(error));
  const frames = parseStackFrames(err.stack);
  const now = Date.now();
  const header = {
    event_id: eventId,
    sent_at: new Date(now).toISOString(),
    dsn: parsed.dsn,
  };
  const itemHeader = {
    type: "event",
    content_type: "application/json",
  };
  const payload = {
    event_id: eventId,
    timestamp: now / 1000,
    platform: "javascript",
    level: "error",
    environment,
    ...(release ? { release } : {}),
    contexts: {
      runtime: {
        name: "bun",
        version: Bun.version,
      },
    },
    exception: {
      values: [
        {
          type: err.name || "Error",
          value: err.message || String(error),
          ...(frames.length > 0 ? { stacktrace: { frames } } : {}),
        },
      ],
    },
  };
  return `${JSON.stringify(header)}\n${JSON.stringify(itemHeader)}\n${JSON.stringify(payload)}\n`;
}

let active: {
  dsn: ParsedDsn;
  environment: string;
  release?: string;
  transport: NonNullable<SentryConfig["transport"]>;
} | null = null;
const inFlight = new Set<Promise<void>>();

const defaultTransport: NonNullable<SentryConfig["transport"]> = async (
  endpoint,
  headers,
  body,
) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(5_000),
  });
  await response.body?.cancel();
};

export function initSentry(config: SentryConfig) {
  const dsn = parseDsn(config.dsn);
  if (!dsn) {
    active = null;
    return;
  }
  active = {
    dsn,
    environment: config.environment || "development",
    release: config.release || undefined,
    transport: config.transport ?? defaultTransport,
  };
}

export function captureException(error: unknown): boolean {
  if (!active || inFlight.size >= maxInFlight) return false;
  const { dsn, environment, release, transport } = active;
  const body = buildExceptionEnvelope(error, dsn, environment, release);
  const headers = {
    "Content-Type": "application/x-sentry-envelope",
    "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=malsignature/1.0`,
  };
  const work: Promise<void> = Promise.resolve()
    .then(async () => {
      await transport(dsn.endpoint, headers, body);
    })
    .catch(() => {})
    .finally(() => {
      inFlight.delete(work);
    });
  inFlight.add(work);
  return true;
}

export async function closeSentry(timeoutMs = 2_000) {
  if (inFlight.size === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(inFlight),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
      timer.unref();
    }),
  ]);
  if (timer) clearTimeout(timer);
}
