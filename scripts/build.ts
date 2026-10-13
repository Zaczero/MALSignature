import {
  cp,
  mkdir,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  origin,
  pageSize,
  publicDirectory,
  stateDirectory,
} from "../src/config";
import { home, notFound, rankingPage, result } from "../src/pages";
import { rankingSearchIndexes } from "../src/ranking-search";
import { State } from "../src/state";
import { staticHeaderRules } from "../src/static";
import { buildAssets } from "./assets";

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
    const assetPaths = await buildAssets(join(staging, "assets"));
    const searchVersion = Bun.hash
      .xxHash3(JSON.stringify({ pageSize, entries: ranking.entries }))
      .toString(16);
    const searchPath = `/ranking/search/${searchVersion}/`;
    const built = await Bun.build({
      entrypoints: [resolve("web/client.ts"), resolve("web/site.css")],
      outdir: join(staging, "assets"),
      target: "browser",
      splitting: true,
      format: "esm",
      naming: {
        entry: "[name].[hash].[ext]",
        chunk: "chunk.[hash].[ext]",
        asset: "[name].[hash].[ext]",
      },
      sourcemap: "external",
      minify: true,
      define: {
        "process.env.NODE_ENV": '"production"',
        __SENTRY_DEBUG__: "false",
        __SENTRY_TRACING__: "false",
      },
      external: ["/assets/*"],
      plugins: [
        {
          name: "versioned-backgrounds",
          setup(builder) {
            builder.onLoad(
              { filter: /\/web\/site\.css$/ },
              async ({ path }) => ({
                contents: assetPaths(await Bun.file(path).text()),
                loader: "css",
              }),
            );
          },
        },
      ],
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
        await cp(output.path, join(".build/sourcemaps", basename(output.path)));
    }
    const ga = process.env.GOOGLE_ANALYTICS_ID || "";
    const release = process.env.SENTRY_RELEASE || "";
    const writePage = async (path: string, html: string) => {
      const destination = join(staging, path);
      await mkdir(resolve(destination, ".."), { recursive: true });
      await Bun.write(
        destination,
        assetPaths(html)
          .replace("/assets/client.js", `/assets/${basename(script.path)}`)
          .replace("/assets/site.css", `/assets/${basename(stylesheet.path)}`)
          .replace(
            "</head>",
            `<meta name="release" content="${Bun.escapeHTML(release)}"><meta name="ranking-index" content="${searchPath}"></head>`,
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
    const searchDirectory = join(staging, searchPath);
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
    // Cached pages and open tabs can still reference the preceding publication.
    for (const directory of ["assets", "ranking/search"]) {
      const previousDirectory = join(publicDirectory, directory);
      for (const file of await readdir(previousDirectory).catch(
        () => [] as string[],
      )) {
        const source = join(previousDirectory, file);
        const destination = join(staging, directory, file);
        if (
          await stat(destination).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
            return null;
          })
        )
          continue;
        const info = await stat(source);
        if (Date.now() - info.mtimeMs < 86_400_000) {
          await cp(source, destination, {
            recursive: true,
            preserveTimestamps: true,
          });
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
