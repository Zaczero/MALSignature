import { file, write } from "bun";

const response = await fetch("https://prometheus.nixos.org/api/v1/query", {
  method: "POST",
  body: new URLSearchParams({
    query: 'channel_revision{channel="nixpkgs-unstable"}',
  }),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok)
  throw new Error(`Nixpkgs revision lookup failed: HTTP ${response.status}`);
const result = (await response.json()) as {
  data: { result: { metric: { revision: string } }[] };
};
const revision = result.data.result[0]?.metric.revision;
if (!revision || !/^[0-9a-f]{40}$/.test(revision))
  throw new Error("No valid nixpkgs revision returned");
const shell = file("shell.nix");
await write(
  shell,
  (await shell.text()).replace(
    /nixpkgs\/archive\/[0-9a-f]{40}/,
    `nixpkgs/archive/${revision}`,
  ),
);
console.log(`Nixpkgs updated to ${revision}`);
