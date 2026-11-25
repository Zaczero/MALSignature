import { afterEach, expect, test } from "bun:test";
import {
  captureException,
  closeSentry,
  initSentry,
  parseStackFrames,
} from "../src/sentry";

afterEach(() => {
  initSentry({});
});

test("parseStackFrames parses named, async, and anonymous Bun stack lines in Sentry order", () => {
  const stack = [
    "Error: boom",
    "    at inner (/home/malsignature/src/signatures.ts:156:11)",
    "    at async handle (/home/malsignature/src/app.ts:52:27)",
    "    at /home/malsignature/node_modules/pkg/index.js:9:3",
  ].join("\n");
  expect(parseStackFrames(stack)).toEqual([
    {
      filename: "/home/malsignature/node_modules/pkg/index.js",
      function: "<anonymous>",
      lineno: 9,
      colno: 3,
      in_app: false,
    },
    {
      filename: "/home/malsignature/src/app.ts",
      function: "handle",
      lineno: 52,
      colno: 27,
      in_app: true,
    },
    {
      filename: "/home/malsignature/src/signatures.ts",
      function: "inner",
      lineno: 156,
      colno: 11,
      in_app: true,
    },
  ]);
});

test("captureException sends a valid Sentry envelope with release and environment", async () => {
  const sent: {
    endpoint: string;
    headers: Record<string, string>;
    body: string;
  }[] = [];
  initSentry({
    dsn: "https://pub123@sentry.monicz.dev/15",
    environment: "production",
    release: "abcdef1234",
    transport: async (endpoint, headers, body) => {
      sent.push({ endpoint, headers, body });
    },
  });
  expect(captureException(new TypeError("bad payload"))).toBe(true);
  await closeSentry();
  expect(sent).toHaveLength(1);
  expect(sent[0].endpoint).toBe("https://sentry.monicz.dev/api/15/envelope/");
  expect(sent[0].headers["X-Sentry-Auth"]).toContain("sentry_key=pub123");
  const lines = sent[0].body
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(lines).toHaveLength(3);
  expect(lines[0]).toMatchObject({
    dsn: "https://pub123@sentry.monicz.dev/15",
  });
  expect(lines[1]).toMatchObject({ type: "event" });
  expect(lines[2]).toMatchObject({
    environment: "production",
    release: "abcdef1234",
    level: "error",
    platform: "javascript",
    exception: {
      values: [{ type: "TypeError", value: "bad payload" }],
    },
  });
});

test("captureException is a no-op when unconfigured or given an invalid DSN", () => {
  initSentry({ dsn: "not-a-dsn" });
  expect(captureException(new Error("ignored"))).toBe(false);
});
