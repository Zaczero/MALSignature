import {
  copyFile,
  mkdir,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
  utimes,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import {
  assetDirectory,
  origin,
  pageSize,
  publicDirectory,
  stateDirectory,
} from "../src/config";
import { home, notFound, rankingPage, result } from "../src/pages";
import { rankingSearchIndexes } from "../src/ranking-search";
import { State } from "../src/state";
import { staticHeaderRules } from "../src/static";

export async function build() {
  const state = new State(stateDirectory);
  const ranking = state.ranking();
  state.close();
  const sites = resolve(".build/sites");
  const staging = join(sites, crypto.randomUUID());
  const link = `${publicDirectory}.pending-${crypto.randomUUID()}`;
  let published = false;
  try {
    await mkdir(join(staging, "assets"), { recursive: true });
    const built = await Bun.build({
      entrypoints: [resolve("web/client.ts"), resolve("web/site.css")],
      outdir: join(staging, "assets"),
      target: "browser",
      splitting: true,
      format: "esm",
      naming: {
        entry: "[name]-[hash].[ext]",
        chunk: "chunk-[hash].[ext]",
        asset: "[name]-[hash].[ext]",
      },
      sourcemap: "external",
      minify: true,
      define: { __SENTRY_DEBUG__: "false" },
      external: ["/assets/*"],
    });
    if (!built.success)
      throw new AggregateError(built.logs, "Frontend build failed");
    const script = built.outputs.find(
      (output) => output.kind === "entry-point" && output.path.endsWith(".js"),
    );
    const stylesheet = built.outputs.find((output) =>
      output.path.endsWith(".css"),
    );
    if (!script || !stylesheet)
      throw new Error("Frontend build did not emit its entry assets");
    await rm(".build/sourcemaps", { recursive: true, force: true });
    await mkdir(".build/sourcemaps", { recursive: true });
    for (const output of built.outputs) {
      if (output.path.endsWith(".map"))
        await rename(
          output.path,
          join(".build/sourcemaps", basename(output.path)),
        );
      else if (output.path.endsWith(".js"))
        await copyFile(
          output.path,
          join(".build/sourcemaps", basename(output.path)),
        );
    }
    const ga = process.env.GOOGLE_ANALYTICS_ID || "";
    const release = process.env.SENTRY_RELEASE || "";
    const writePage = async (path: string, html: string) => {
      const destination = join(staging, path);
      await mkdir(resolve(destination, ".."), { recursive: true });
      await Bun.write(
        destination,
        html
          .replace("/assets/client.js", `/assets/${basename(script.path)}`)
          .replace("/assets/site.css", `/assets/${basename(stylesheet.path)}`)
          .replace(
            "</head>",
            `<meta name="release" content="${Bun.escapeHTML(release)}"></head>`,
          ),
      );
    };
    await writePage("index.html", home(ga));
    await writePage("signature/index.html", result(ga));
    await writePage("404.html", notFound());
    await Bun.write(
      join(staging, "_headers"),
      `${Object.entries(staticHeaderRules)
        .map(([pattern, headers]) =>
          [
            pattern,
            ...Object.entries(headers).map(
              ([key, value]) => `  ${key}: ${value}`,
            ),
          ].join("\n"),
        )
        .join("\n\n")}\n`,
    );
    const paths = ["/"];
    for (
      let page = 1;
      page <= Math.max(1, Math.ceil(ranking.entries.length / pageSize));
      page++
    ) {
      const path = page === 1 ? "/ranking/" : `/ranking/page/${page}/`;
      paths.push(path);
      await writePage(
        `${path.slice(1)}index.html`,
        rankingPage(ranking, page, ga),
      );
    }
    const searchDirectory = join(staging, "ranking/search");
    await mkdir(searchDirectory, { recursive: true });
    for (const [prefix, index] of rankingSearchIndexes(ranking)) {
      await Bun.write(
        join(searchDirectory, `${prefix}.json`),
        JSON.stringify(index),
      );
    }
    await Bun.write(
      join(staging, "robots.txt"),
      `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
    );
    await Bun.write(
      join(staging, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
        .filter((path) => !path.startsWith("/ranking/page/"))
        .map(
          (path) =>
            `<url><loc>${origin}${path}</loc>${path.startsWith("/ranking") ? `<lastmod>${ranking.updatedAt.slice(0, 10)}</lastmod>` : ""}</url>`,
        )
        .join("")}</urlset>`,
    );
    const background = join(assetDirectory, "background.webp");
    await copyFile(background, join(staging, "assets/background.webp"));
    await sharp(background)
      .resize({ width: 2048 })
      .webp({ quality: 90 })
      .toFile(join(staging, "assets/background-medium.webp"));
    await sharp(background)
      .resize({
        width: 1216,
        height: 2160,
        fit: "cover",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toFile(join(staging, "assets/background-mobile.webp"));
    for (const name of ["example-normal", "example-small"]) {
      await sharp(join(assetDirectory, `${name}.png`))
        .webp({ lossless: true })
        .toFile(join(staging, "assets", `${name}.webp`));
    }
    await Bun.write(
      join(staging, "assets/favicon.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="20" fill="#17192f"/><path d="m32 10 6 16 16 6-16 6-6 16-6-16-16-6 16-6Z" fill="#c7b8ff"/></svg>',
    );
    const card = createCanvas(1200, 630);
    const ctx = card.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
    gradient.addColorStop(0, "#28254a");
    gradient.addColorStop(1, "#101729");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = "#f1efff";
    ctx.font = "bold 76px sans-serif";
    ctx.fillText("MALSignature", 85, 255);
    ctx.fillStyle = "#c6bdff";
    ctx.font = "46px sans-serif";
    ctx.fillText("Your anime story. Made to share.", 85, 340);
    await Bun.write(
      join(staging, "assets/social.png"),
      await card.encode("png"),
    );
    // A cached document may still reference the preceding build's hashed assets.
    const oldAssets = join(publicDirectory, "assets");
    for (const file of await readdir(oldAssets).catch(() => [] as string[])) {
      if (
        /^(client|site|chunk)-/.test(file) &&
        !(await Bun.file(join(staging, "assets", file)).exists())
      ) {
        const stat = await Bun.file(join(oldAssets, file)).stat();
        if (Date.now() - stat.mtimeMs < 86_400_000) {
          await copyFile(join(oldAssets, file), join(staging, "assets", file));
          await utimes(join(staging, "assets", file), stat.atime, stat.mtime);
        }
      }
    }
    const previous = await readlink(publicDirectory).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      },
    );
    await symlink(staging, link);
    await rename(link, publicDirectory);
    published = true;
    if (previous?.startsWith(`${sites}/`))
      await rm(previous, { recursive: true, force: true });
    console.log(
      `Built ${paths.length + 1} pages and ${ranking.entries.length.toLocaleString("en")} ranking entries.`,
    );
  } finally {
    await rm(link, { force: true });
    if (!published) await rm(staging, { recursive: true, force: true });
  }
}
if (import.meta.main) await build();
