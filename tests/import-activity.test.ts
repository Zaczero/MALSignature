import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { State } from "../src/state";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function run(directory: string, args: string[], stdin?: string) {
  const child = Bun.spawn(
    [process.execPath, resolve("scripts/import-activity.ts"), ...args],
    {
      env: { STATE_DIRECTORY: directory },
      stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

test("Import overlapping gzip and stdin logs repeatedly without altering legacy state", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "malsignature-activity-import-"),
  );
  directories.push(directory);
  const state = new State(directory);
  state.importRanking({
    updatedAt: new Date().toISOString(),
    entries: [["Example_User", 73]],
  });
  state.db.run("UPDATE signatures SET last_seen = 12345");
  state.close();
  const time = Math.floor((Date.now() - 3_600_000) / 1000);
  const record = (uri: string) =>
    JSON.stringify({
      ts: time,
      status: 200,
      request: { host: "malsignature.com", method: "GET", uri },
    });
  const content = [
    record("/?/view?username=Example_User&style=normal"),
    record("/view.php?a=example_user&b=1"),
  ].join("\n");
  const file = join(directory, "access.jsonl.gz");
  await Bun.write(file, gzipSync(content));
  expect((await run(directory, [file])).code).toBe(0);
  const replay = await run(directory, ["-"], content);
  expect(replay.code).toBe(0);
  expect(replay.stdout).toContain("extended 0 activity windows");
  const reopened = new State(directory);
  try {
    expect(reopened.get("Example_User")).toMatchObject({
      views: 73,
      last_seen: 12345,
      updated: 0,
    });
    expect(reopened.ranking().entries).toEqual([["Example_User", 0.2]]);
    expect(
      reopened.db
        .query<{ total: number }, []>(
          "SELECT COUNT(*) AS total FROM signature_activity",
        )
        .get()?.total,
    ).toBe(1);
  } finally {
    reopened.close();
  }
});

test("Activity CLI reports help, usage errors and unreadable input distinctly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "malsignature-activity-cli-"));
  directories.push(directory);
  expect((await run(directory, ["--help"])).code).toBe(0);
  expect((await run(directory, [])).code).toBe(2);
  expect((await run(directory, ["--unknown"])).code).toBe(2);
  const missing = await run(directory, [join(directory, "missing.gz")]);
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain("Activity import failed:");
});
