import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Images } from "./images";
import type { State } from "./state";

const day = 86400_000;

export async function prune(
  state: State,
  images: Images,
  cacheDirectory: string,
) {
  const now = Date.now();
  const expired = new Set(state.prune(now - 30 * day));
  let removed = 0;
  for (const key of expired) {
    await images.remove(key);
    removed++;
  }
  const referenced = state.imageKeys();
  // Interrupted uploads and deletion failures are unreferenced; fresh uploads may still be in flight.
  for await (const entry of images.entries()) {
    if (entry.modified < now - day && !referenced.has(entry.key)) {
      await images.remove(entry.key);
      removed++;
    }
  }
  let cached = 0;
  for (const key of await readdir(cacheDirectory).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return [] as string[];
    },
  )) {
    const path = join(cacheDirectory, key);
    const stat = await Bun.file(path)
      .stat()
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
    if (stat?.isFile() && stat.mtimeMs < now - day) {
      await unlink(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
      cached++;
    }
  }
  return { images: removed, cached };
}
