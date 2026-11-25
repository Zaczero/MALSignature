import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { State } from "../src/state";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

test("Buffered state matches unbuffered views and activity across flush and restart", async () => {
  const bufferedDir = await mkdtemp(join(tmpdir(), "malsignature-buf-"));
  const directDir = await mkdtemp(join(tmpdir(), "malsignature-dir-"));
  cleanups.push(
    () => rm(bufferedDir, { recursive: true, force: true }),
    () => rm(directDir, { recursive: true, force: true }),
  );
  const buffered = new State(bufferedDir, { flushIntervalMs: 60_000 });
  const direct = new State(directDir);
  cleanups.push(
    () => buffered.close(),
    () => direct.close(),
  );

  for (const s of [buffered, direct]) {
    s.publish("Hot_User", "n.png", "s.png", "h1");
    s.publish("Other_User", "n.png", "s.png", "h2");
  }

  const base = Date.parse("2026-10-13T12:00:00Z");
  const events: [string, number][] = [
    ["Hot_User", base],
    ["hot_user", base + 5_000],
    ["HOT_USER", base + 12_000],
    ["Other_User", base + 60_000],
    // Disjoint timestamp >1h later forces a mid-stream flush for Hot_User.
    ["Hot_User", base + 7_200_000],
    // Out-of-order earlier timestamp bridges into the existing window.
    ["Hot_User", base + 3_600_000],
  ];

  for (const [user, ts] of events) {
    const bRow = buffered.access(user, true);
    const dRow = direct.access(user, true);
    expect(bRow?.views).toBe(dRow?.views);
    buffered.recordActivity(user, ts);
    direct.recordActivity(user, ts);
  }

  // Pending views are immediately visible via get() before flush.
  expect(buffered.get("Hot_User")?.views).toBe(5);
  expect(buffered.get("Other_User")?.views).toBe(1);

  // ranking() flushes buffered state before computing popularity.
  const snapTime = base + 10_800_000;
  expect(buffered.ranking(snapTime)).toEqual(direct.ranking(snapTime));

  // Verify persistence across close & reopen.
  buffered.close();
  const reopened = new State(bufferedDir);
  cleanups.push(() => reopened.close());
  expect(reopened.get("Hot_User")?.views).toBe(5);
  expect(reopened.get("Other_User")?.views).toBe(1);
  expect(reopened.ranking(snapTime)).toEqual(direct.ranking(snapTime));
});
