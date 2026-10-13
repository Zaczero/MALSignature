import { stateDirectory } from "../src/config";
import { State, type ViewRanking } from "../src/state";

const file = process.argv[2];
if (!file) throw new Error("Usage: bun run ranking <ranking.json>");
const state = new State(stateDirectory);
try {
  const ranking = (await Bun.file(file).json()) as ViewRanking;
  const result = state.importRanking(ranking);
  console.log(
    `Imported ${result.imported.toLocaleString("en")} ranking entries; skipped ${result.skipped} invalid usernames.`,
  );
} finally {
  state.close();
}
