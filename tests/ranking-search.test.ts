import { expect, test } from "bun:test";
import { pageSize } from "../src/config";
import { rankingSearchIndexes } from "../src/ranking-search";

test("Search indexes keep global ranks across case-insensitive username prefixes", () => {
  const entries: [string, number][] = Array.from(
    { length: pageSize - 1 },
    (_, index) => [`Alpha_${index}`, 9000 - index],
  );
  entries.push(["Zaczer_o", 42], ["ZAlpha", 41], ["A", 40]);
  const indexes = rankingSearchIndexes({
    updatedAt: "2026-10-13T00:00:00Z",
    entries,
  });
  expect(indexes.get("za")).toEqual({
    pageSize,
    entries: [
      ["Zaczer_o", pageSize],
      ["ZAlpha", pageSize + 1],
    ],
  });
  expect(indexes.get("a")?.entries).toEqual([["A", pageSize + 2]]);
  expect(indexes.has("Za")).toBe(false);
  expect(indexes.has("missing")).toBe(false);
});

test("An empty leaderboard emits no search indexes", () => {
  expect(
    rankingSearchIndexes({
      updatedAt: "2026-10-13T00:00:00Z",
      entries: [],
    }).size,
  ).toBe(0);
});
