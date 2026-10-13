import { pageSize } from "./config";
import type { Ranking } from "./state";

export interface RankingSearchIndex {
  pageSize: number;
  entries: [username: string, rank: number][];
}

export function rankingSearchIndexes(ranking: Ranking) {
  const indexes = new Map<string, RankingSearchIndex>();
  for (const [index, [username]] of ranking.entries.entries()) {
    const prefix = username.slice(0, 2).toLowerCase();
    let group = indexes.get(prefix);
    if (!group) {
      group = { pageSize, entries: [] };
      indexes.set(prefix, group);
    }
    group.entries.push([username, index + 1]);
  }
  return indexes;
}
