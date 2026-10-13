import "./instrument";
import { join } from "node:path";
import * as Sentry from "@sentry/bun";
import { createHandler } from "./app";
import { publicDirectory, stateDirectory } from "./config";
import { Images } from "./images";
import { Signatures } from "./signatures";
import { State } from "./state";

const state = new State(stateDirectory);
const signatures = new Signatures(
  state,
  new Images(join(stateDirectory, "images")),
);
const server = Bun.serve({
  hostname: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  maxRequestBodySize: 4096,
  idleTimeout: 60,
  fetch: createHandler(signatures, publicDirectory),
});
console.log(`MALSignature listening on ${server.url}`);
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    await server.stop();
    await signatures.drain();
    await Sentry.close();
    state.close();
    process.exit(0);
  });
}
