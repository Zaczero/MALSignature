import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { createGunzip } from "node:zlib";
import { imageAccess } from "../src/access-log";
import { activityHour, popularityWindow } from "../src/activity";
import { stateDirectory } from "../src/config";
import { State } from "../src/state";

const help = `Usage: bun run activity [--help] FILE...

Import successful image GETs from Caddy JSON access logs or journalctl -o json
Use - to read standard input; .gz files are decompressed automatically
Overlapping or repeated logs do not double-count activity
Keep lifetime views and last-access timestamps unchanged
Refresh the popularity snapshot after import; rebuild the site to publish it locally
`;

async function main() {
  let files: string[];
  try {
    const args = parseArgs({
      options: { help: { type: "boolean" } },
      allowPositionals: true,
    });
    if (args.values.help) {
      console.log(help);
      return;
    }
    files = args.positionals;
    if (!files.length) throw new Error("provide at least one access log");
    if (files.filter((file) => file === "-").length > 1)
      throw new Error("standard input can only be read once");
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : error}\n${help}`);
    process.exitCode = 2;
    return;
  }
  const state = new State(stateDirectory);
  const now = Date.now();
  let matched = 0;
  let changed = 0;
  let expired = 0;
  let malformed = 0;
  let earliest = Infinity;
  let latest = 0;
  const batch: { username: string; time: number }[] = [];
  const commit = state.db.transaction(() => {
    for (const access of batch)
      if (state.activity.record(access.username, access.time)) changed++;
  });
  const flush = () => {
    commit.immediate();
    batch.length = 0;
  };
  try {
    for (const file of files) {
      const source = file === "-" ? process.stdin : createReadStream(file);
      const input = file.endsWith(".gz") ? source.pipe(createGunzip()) : source;
      if (input !== source) source.on("error", (error) => input.destroy(error));
      const lines = createInterface({ input, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          if (!line.trim()) continue;
          let access: ReturnType<typeof imageAccess>;
          try {
            access = imageAccess(line);
          } catch (error) {
            if (!(error instanceof SyntaxError || error instanceof TypeError))
              throw error;
            malformed++;
            continue;
          }
          if (!access) continue;
          if (
            access.time > now ||
            access.time + activityHour <= now - popularityWindow
          ) {
            expired++;
            continue;
          }
          matched++;
          earliest = Math.min(earliest, access.time);
          latest = Math.max(latest, access.time);
          batch.push(access);
          if (batch.length === 1000) flush();
        }
      } finally {
        lines.close();
        if (file !== "-") source.destroy();
        if (input !== source) input.destroy();
      }
    }
    if (batch.length) flush();
    state.activity.snapshot(now);
    console.log(
      `Imported ${matched.toLocaleString("en")} image accesses; extended ${changed.toLocaleString("en")} activity windows. Skipped ${expired.toLocaleString("en")} out-of-window and ${malformed.toLocaleString("en")} malformed records.`,
    );
    if (matched)
      console.log(
        `History: ${new Date(earliest).toISOString()} to ${new Date(latest).toISOString()}`,
      );
  } finally {
    state.close();
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(
      `Activity import failed: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}
