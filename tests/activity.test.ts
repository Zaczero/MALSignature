import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { popularityScore } from "../src/activity";
import { State } from "../src/state";

const now = Date.parse("2026-10-13T12:00:00Z");
const start = Date.parse("2026-09-13T12:00:00Z");
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function state() {
  const directory = await mkdtemp(join(tmpdir(), "malsignature-activity-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const state = new State(directory);
  cleanups.push(() => state.close());
  state.importRanking({
    updatedAt: "2026-09-01T00:00:00Z",
    entries: [["Example_User", 431]],
  });
  return { state, directory };
}

test.each([
  ["overlapping requests", [0, 30], 5_400_000],
  ["duplicate requests", [0, 0], 3_600_000],
  ["adjacent requests", [0, 60], 7_200_000],
  ["disjoint requests", [0, 120], 7_200_000],
  ["out-of-order bridge", [90, 0, 45], 9_000_000],
  ["request before the cutoff", [-30], 1_800_000],
  ["request wholly before the cutoff", [-60], 0],
] as const)(
  "%s contributes exact covered time",
  async (_, minutes, covered) => {
    const app = await state();
    for (const minute of minutes)
      app.state.activity.record("eXaMpLe_UsEr", start + minute * 60_000);
    app.state.activity.snapshot(now);
    expect(
      app.state.db
        .query<{ covered: number }, []>(
          "SELECT covered FROM signature_popularity WHERE username = 'example_user'",
        )
        .get()?.covered,
    ).toBe(covered);
    expect(app.state.get("Example_User")).toMatchObject({
      views: 431,
      last_seen: 0,
      updated: 0,
    });
  },
);

test("Activity only credits time before the snapshot, not the future window tail", async () => {
  const app = await state();
  app.state.activity.record("Example_User", now - 1_800_000);
  expect(app.state.ranking(now).entries).toEqual([["Example_User", 0.1]]);
});

test("A full month, half a month and a tiny gap have distinct scores", () => {
  expect(popularityScore(0)).toBe(0);
  expect(popularityScore(1)).toBe(0.1);
  expect(popularityScore(1_296_000_000)).toBe(50);
  expect(popularityScore(2_592_000_000 - 1)).toBe(99.9);
  expect(popularityScore(2_592_000_000)).toBe(100);
});

test("Continuous requests merge into one interval and survive restart", async () => {
  const app = await state();
  for (let hour = 0; hour < 720; hour++)
    app.state.activity.record("Example_User", start + hour * 3_600_000);
  expect(
    app.state.db
      .query<{ total: number }, []>(
        "SELECT COUNT(*) AS total FROM signature_activity",
      )
      .get()?.total,
  ).toBe(1);
  const reopened = new State(app.directory);
  cleanups.push(() => reopened.close());
  expect(reopened.ranking(now).entries).toEqual([["Example_User", 100]]);
});

test("Snapshots stay fixed during the day and advance on the next day", async () => {
  const app = await state();
  app.state.activity.record("Example_User", now - 3_600_000);
  const first = app.state.ranking(now);
  app.state.activity.record("Example_User", now + 3_600_000);
  expect(app.state.ranking(now + 7_200_000)).toEqual(first);
  expect(app.state.ranking(now + 86_400_000).entries).toEqual([
    ["Example_User", 0.3],
  ]);
});

test("Rank by exact coverage before rounded scores and never by retained view counts", async () => {
  const app = await state();
  app.state.importRanking({
    updatedAt: "2026-09-01T00:00:00Z",
    entries: [
      ["A_User", 1000],
      ["Z_User", 0],
      ["Inactive", 10_000],
    ],
  });
  app.state.activity.record("A_User", now - 3_600_000);
  app.state.activity.record("Z_User", now - 3_600_001);
  app.state.activity.record("Z_User", now - 1);
  expect(app.state.ranking(now).entries).toEqual([
    ["Z_User", 0.2],
    ["A_User", 0.2],
    ["Example_User", 0],
    ["Inactive", 0],
  ]);
  expect(app.state.get("Inactive")?.views).toBe(10_000);
});

test("Activity never registers unknown usernames", async () => {
  const app = await state();
  expect(app.state.activity.record("Unknown", now)).toBe(false);
  expect(app.state.get("Unknown")).toBeNull();
});

test("Expired coverage is pruned without losing accounts or lifetime totals", async () => {
  const app = await state();
  app.state.activity.record("Example_User", start - 3_600_000);
  app.state.activity.snapshot(now);
  expect(
    app.state.db
      .query<{ total: number }, []>(
        "SELECT COUNT(*) AS total FROM signature_activity",
      )
      .get()?.total,
  ).toBe(0);
  expect(app.state.get("Example_User")).toMatchObject({
    views: 431,
    last_seen: 0,
  });
});
