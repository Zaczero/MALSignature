import { join } from "node:path";
import { stateDirectory } from "../src/config";
import { Images } from "../src/images";
import { prune } from "../src/maintenance";
import { State } from "../src/state";

const state = new State(stateDirectory);
try {
  const removed = await prune(
    state,
    new Images(join(stateDirectory, "images")),
    join(stateDirectory, "cache"),
  );
  console.log(
    `Removed ${removed.images} inactive or orphaned images and ${removed.cached} expired source images.`,
  );
} finally {
  state.close();
}
