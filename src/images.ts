import { mkdir, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

export class Images {
  constructor(readonly directory: string) {}
  async put(key: string, content: Uint8Array) {
    await mkdir(this.directory, { recursive: true });
    const temporary = join(this.directory, `${key}.${crypto.randomUUID()}.tmp`);
    try {
      await Bun.write(temporary, content);
      await rename(temporary, join(this.directory, key));
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
  get(key: string): BodyInit {
    return Bun.file(join(this.directory, key));
  }
  async remove(key: string) {
    await unlink(join(this.directory, key)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      },
    );
  }
  retire(key: string) {
    // Let image responses already reading the old object finish before deleting it.
    setTimeout(() => {
      void this.remove(key).catch((error) =>
        console.error("Image cleanup failed:", error),
      );
    }, 60_000).unref();
  }
  async *entries(): AsyncGenerator<{ key: string; modified: number }> {
    for (const key of await readdir(this.directory).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return [] as string[];
      },
    )) {
      const file = Bun.file(join(this.directory, key));
      const stat = await file.stat().catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
      if (stat?.isFile()) yield { key, modified: stat.mtimeMs };
    }
  }
}
