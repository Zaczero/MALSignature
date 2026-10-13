import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createHandler } from "../src/app";
import { generationLimits } from "../src/config";
import { Images } from "../src/images";
import { prune } from "../src/maintenance";
import { home, rankingPage } from "../src/pages";
import { type Profile, ProfileError } from "../src/profile";
import { renderImages, renderInputHash } from "../src/render";
import { Signatures } from "../src/signatures";
import { State } from "../src/state";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function application() {
  const directory = await mkdtemp(join(tmpdir(), "malsignature-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const state = new State(directory);
  cleanups.push(async () => {
    state.close();
  });
  const images = new Images(join(directory, "images"));
  const site = join(directory, "site");
  await mkdir(site);
  await Bun.write(join(site, "index.html"), home());
  await Bun.write(join(site, "404.html"), "<h1>Not found</h1>");
  return {
    state,
    images,
    handler: createHandler(new Signatures(state, images), site),
    directory,
  };
}

test.each([
  ["/?/view?username=example_user&amp;style=small", "small"],
  ["/index.php?/view?username=Example_User&amp;style=small", "small"],
  ["/index.php?view&username=Example_User&style=normal", "normal"],
  ["/index.php?/view.php?username=Example%5FUser&style=small", "small"],
  ["/index.php?view.php&amp;username=Example_User&amp;style=normal", "normal"],
  ["/view.php?a=Example_User&b=1", "small"],
  ["/view.php?amp;a=Example_User&amp;b=2", "normal"],
] as const)(
  "Embed %s returns the expected PNG directly with conditional requests",
  async (path, style) => {
    const app = await application();
    const normal = await createCanvas(400, 135).encode("png");
    const small = await createCanvas(400, 63).encode("png");
    await app.images.put("normal.png", normal);
    await app.images.put("small.png", small);
    app.state.publish("Example_User", "normal.png", "small.png", null);
    const response = await app.handler(new Request(`http://localhost${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array(style === "small" ? small : normal),
    );
    const conditional = await app.handler(
      new Request(`http://localhost${path}`, {
        headers: { "If-None-Match": response.headers.get("ETag") ?? "" },
      }),
    );
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
  },
);

test("Static pages and versioned assets carry the hosting header policy", async () => {
  const app = await application();
  const site = join(app.directory, "site");
  await mkdir(join(site, "assets"));
  await mkdir(join(site, "signature"));
  await mkdir(join(site, "ranking/page/2"), { recursive: true });
  await mkdir(join(site, "ranking/search/abcd"), { recursive: true });
  await Bun.write(join(site, "assets/client.example.js"), "export {}");
  await Bun.write(join(site, "assets/background.abcd.webp"), "image");
  await Bun.write(join(site, "ranking/search/abcd/za.json"), "{}");
  await Bun.write(
    join(site, "signature/index.html"),
    "<h1>Your signature</h1>",
  );
  await Bun.write(
    join(site, "ranking/page/2/index.html"),
    "<h1>Leaderboard</h1>",
  );
  const page = await app.handler(
    new Request("http://localhost/?utm_source=test"),
  );
  expect(page.headers.get("Cache-Control")).toBe("public, max-age=300");
  expect(page.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(page.headers.get("Referrer-Policy")).toBe(
    "strict-origin-when-cross-origin",
  );
  for (const path of [
    "/assets/client.example.js",
    "/assets/background.abcd.webp",
    "/ranking/search/abcd/za.json",
  ]) {
    const asset = await app.handler(new Request(`http://localhost${path}`));
    expect(asset.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
  }
  const preview = await app.handler(
    new Request("http://localhost/signature/?username=Example_User"),
  );
  expect(preview.headers.get("X-Robots-Tag")).toBe("noindex");
  const laterRanking = await app.handler(
    new Request("http://localhost/ranking/page/2/"),
  );
  expect(laterRanking.headers.get("X-Robots-Tag")).toBe("noindex");
  const missing = await app.handler(
    new Request("http://localhost/assets/client.missing.js"),
  );
  expect(missing.status).toBe(404);
  expect(missing.headers.get("Cache-Control")).toBe("no-store");
});

test("Only successful image GETs and revalidations earn shared activity coverage", async () => {
  const app = await application();
  const png = await createCanvas(400, 63).encode("png");
  await app.images.put("activity.png", png);
  for (const username of ["Active_User", "Head_Only", "Generated_Only"])
    app.state.publish(username, "activity.png", "activity.png", null);
  const image = await app.handler(
    new Request("http://localhost/?/view?username=Active_User&style=normal"),
  );
  expect(image.status).toBe(200);
  const conditional = await app.handler(
    new Request("http://localhost/view.php?a=active_user&b=1", {
      headers: { "If-None-Match": image.headers.get("ETag") ?? "" },
    }),
  );
  expect(conditional.status).toBe(304);
  expect(
    app.state.db
      .query<{ username: string; total: number }, []>(
        "SELECT username, COUNT(*) AS total FROM signature_activity GROUP BY username",
      )
      .all(),
  ).toEqual([{ username: "Active_User", total: 1 }]);
  expect(
    (
      await app.handler(
        new Request("http://localhost/view.php?a=Head_Only", {
          method: "HEAD",
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    (await app.handler(new Request("http://localhost/view.php?a=Unknown")))
      .status,
  ).toBe(404);
  const generated = await app.handler(
    new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Generated_Only" }),
    }),
  );
  expect(generated.status).toBe(200);
  expect(
    app.state.db
      .query<{ total: number }, []>(
        "SELECT COUNT(*) AS total FROM signature_activity",
      )
      .get()?.total,
  ).toBe(1);
});

test("Generation behind an HTTP proxy validates the configured public HTTPS origin", async () => {
  const app = await application();
  app.state.publish("Example_User", "normal.png", "small.png", null);
  const handler = createHandler(
    new Signatures(app.state, app.images),
    join(app.directory, "site"),
    "https://malsignature.com",
  );
  for (const origin of [
    "https://malsignature.com",
    "https://elsewhere.example",
    "http://malsignature.com",
  ]) {
    const response = await handler(
      new Request("http://malsignature.com/api/generate", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ username: "Example_User" }),
      }),
    );
    expect(response.status).toBe(
      origin === "https://malsignature.com" ? 200 : 403,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
});

test.each(["_headers", "_redirects"])(
  "Hosting metadata %s is not a public asset",
  async (name) => {
    const app = await application();
    await Bun.write(
      join(app.directory, "site", name),
      "private hosting metadata",
    );
    const response = await app.handler(new Request(`http://localhost/${name}`));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("private hosting metadata");
  },
);

test.each([
  ["/?/ranking?page=1", "/ranking/"],
  ["/?ranking", "/ranking/"],
  ["/?/success?username=ranking", "/signature/"],
  ["/?success&username=Example_User", "/signature/"],
])(
  "Legacy page %s redirects to its static route",
  async (path, destination) => {
    const app = await application();
    const response = await app.handler(new Request(`http://localhost${path}`));
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      `http://localhost${destination}`,
    );
  },
);

test("The homepage is HTML, unknown routes are 404, and unknown signatures do not redirect", async () => {
  const app = await application();
  const page = await app.handler(new Request("http://localhost/"));
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("<h1>");
  const missing = await app.handler(
    new Request("http://localhost/does-not-exist"),
  );
  expect(missing.status).toBe(404);
  const signature = await app.handler(
    new Request("http://localhost/?/view?username=unknown&style=normal"),
  );
  expect(signature.status).toBe(404);
  expect(signature.headers.get("Cache-Control")).toBe("no-store");
});

test("Persist imported totals without replacing them when generating images", async () => {
  const app = await application();
  app.state.importRanking({
    updatedAt: "2026-10-13T00:00:00Z",
    entries: [
      ["OlderUser", 430],
      ["OtherUser", 92],
    ],
  });
  app.state.publish("olderuser", "normal.png", "small.png", null);
  app.state.access("OLDERUSER", true);
  expect(app.state.get("OlderUser")?.views).toBe(431);
  expect(app.state.ranking().entries).toEqual([
    ["OlderUser", 0],
    ["OtherUser", 0],
  ]);
});

test("Import normalizes old whitespace and excludes malformed profile URL records", async () => {
  const app = await application();
  const result = app.state.importRanking({
    updatedAt: "2026-10-13T00:00:00Z",
    entries: [
      ["Legacy_User  ", 73],
      ["https://example.invalid/not-a-username", 6],
    ],
  });
  expect(result).toEqual({ imported: 1, skipped: 1 });
  expect(app.state.get("legacy_user")?.views).toBe(73);
});

test("An upstream failure keeps the old PNG and defers another refresh attempt", async () => {
  const app = await application();
  const png = await createCanvas(400, 63).encode("png");
  await app.images.put("last-good.png", png);
  app.state.publish("Existing_User", "last-good.png", "last-good.png", null);
  app.state.db.run("UPDATE signatures SET updated = 0");
  let requests = 0;
  const signatures = new Signatures(app.state, app.images, async () => {
    requests++;
    throw new ProfileError("Upstream is temporarily unavailable", 502);
  });
  const handler = createHandler(signatures, app.directory);
  const request = new Request(
    "http://localhost/?/view?username=Existing_User&style=small",
  );
  const first = await handler(request);
  expect(first.status).toBe(200);
  expect(new Uint8Array(await first.arrayBuffer())).toEqual(
    new Uint8Array(png),
  );
  await signatures.drain();
  expect(app.state.get("Existing_User")?.small).toBe("last-good.png");
  expect(app.state.retry("Existing_User")?.retry_at).toBeGreaterThan(
    Date.now(),
  );
  const second = await handler(request);
  expect(second.status).toBe(200);
  expect(requests).toBe(1);
});

test("Existing signatures remain fresh for one hour", async () => {
  const app = await application();
  app.state.publish("Hourly_User", "normal.png", "small.png", null);
  const age = app.state.db.query("UPDATE signatures SET updated = ?");
  age.run(Date.now() - 30 * 60_000);
  let requests = 0;
  const signatures = new Signatures(app.state, app.images, async () => {
    requests++;
    throw new ProfileError("Profile unavailable", 404);
  });
  expect((await signatures.generate("Hourly_User")).normal).toBe("normal.png");
  expect(requests).toBe(0);
  age.run(Date.now() - 61 * 60_000);
  await expect(signatures.generate("Hourly_User")).rejects.toMatchObject({
    status: 404,
  });
  expect(requests).toBe(1);
});

test("Signature cache freshness follows image age with bounded refresh headroom", async () => {
  const app = await application();
  app.state.publish("Cached_User", "normal.png", "small.png", null);
  app.state.defer("Cached_User", new ProfileError("Profile unavailable", 404));
  const signatures = new Signatures(app.state, app.images);
  const request = new Request(
    "https://malsignature.com/?/view?username=Cached_User",
  );
  for (const [ageSeconds, remaining] of [
    [0, 3600],
    [1800, 1800],
    [3590, 60],
    [7200, 60],
  ]) {
    app.state.db
      .query("UPDATE signatures SET updated = ?")
      .run(Date.now() - ageSeconds * 1000);
    const response = await signatures.view("Cached_User", "normal", request);
    expect(response.headers.get("Cache-Control")).toBe(
      `public, max-age=${remaining}, s-maxage=${remaining}, stale-while-revalidate=86400, stale-if-error=604800`,
    );
    const conditional = await signatures.view(
      "Cached_User",
      "normal",
      new Request(request, {
        headers: { "If-None-Match": response.headers.get("ETag") ?? "" },
      }),
    );
    expect(conditional.status).toBe(304);
    expect(conditional.headers.get("Cache-Control")).toBe(
      response.headers.get("Cache-Control"),
    );
  }
});

test("Deleted profiles are negatively cached across restart and retry more slowly", async () => {
  const app = await application();
  let requests = 0;
  const source = async () => {
    requests++;
    throw new ProfileError("Profile deleted", 404);
  };
  const signatures = new Signatures(app.state, app.images, source);
  await expect(signatures.generate("Deleted_User")).rejects.toMatchObject({
    status: 404,
  });
  const firstDelay =
    (app.state.retry("Deleted_User")?.retry_at ?? 0) - Date.now();
  const reopened = new State(app.directory);
  cleanups.push(async () => reopened.close());
  const restarted = new Signatures(reopened, app.images, source);
  for (let attempt = 0; attempt < 10; attempt++) {
    await expect(restarted.generate("deleted_user")).rejects.toMatchObject({
      status: 404,
    });
  }
  expect(requests).toBe(1);
  expect(reopened.ranking().entries).toEqual([]);
  reopened.db.run("UPDATE refresh_failures SET retry_at = 0");
  await expect(restarted.generate("Deleted_User")).rejects.toMatchObject({
    status: 404,
  });
  expect(requests).toBe(2);
  expect(
    (reopened.retry("Deleted_User")?.retry_at ?? 0) - Date.now(),
  ).toBeGreaterThan(firstDelay);
});

test("Missing profiles leave rankings until recovery without losing their account or totals", async () => {
  const app = await application();
  for (const username of ["Active", "Deleted", "Renamed", "Temporary"]) {
    app.state.publish(username, "normal.png", "small.png", null);
  }
  app.state.db
    .query("UPDATE signatures SET views = ? WHERE username = ?")
    .run(1000, "Deleted");
  app.state.defer("Deleted", new ProfileError("Profile deleted", 404));
  app.state.defer("Renamed", new ProfileError("Profile gone", 410));
  app.state.defer("Temporary", new ProfileError("Upstream unavailable", 503));
  expect(app.state.ranking().entries.map(([username]) => username)).toEqual([
    "Active",
    "Temporary",
  ]);
  app.state.db.exec("UPDATE refresh_failures SET retry_at = 0");
  app.state.defer("Deleted", new ProfileError("Upstream unavailable", 503));
  const reopened = new State(app.directory);
  cleanups.push(async () => reopened.close());
  expect(reopened.ranking().entries.map(([username]) => username)).toEqual([
    "Active",
    "Temporary",
  ]);
  expect(reopened.get("Deleted")).toMatchObject({
    views: 1000,
    normal: "normal.png",
    small: "small.png",
  });
  reopened.publish("Deleted", "normal.png", "small.png", null);
  expect(reopened.ranking().entries).toEqual([
    ["Active", 0],
    ["Deleted", 0],
    ["Temporary", 0],
  ]);
});

test("Existing retry records migrate missing-profile visibility without losing state", async () => {
  const app = await application();
  app.state.publish("Old_Deleted", "normal.png", "small.png", null);
  app.state.defer("Old_Deleted", new ProfileError("Profile deleted", 404));
  app.state.db.exec("ALTER TABLE refresh_failures DROP COLUMN profile_missing");
  const reopened = new State(app.directory);
  cleanups.push(async () => reopened.close());
  expect(reopened.ranking().entries).toEqual([]);
  expect(reopened.get("Old_Deleted")?.normal).toBe("normal.png");
  expect(reopened.retry("Old_Deleted")?.status).toBe(404);
});

test("An upstream Retry-After stops requests for other usernames too", async () => {
  const app = await application();
  let requests = 0;
  const source = async () => {
    requests++;
    throw new ProfileError("Rate limited", 429, 7200);
  };
  const signatures = new Signatures(app.state, app.images, source);
  const handler = createHandler(signatures, app.directory);
  const generate = (username: string) =>
    handler(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      }),
    );
  const first = await generate("First_User");
  expect(first.status).toBe(429);
  expect(Number(first.headers.get("Retry-After"))).toBeGreaterThanOrEqual(7199);
  const second = await generate("Another_User");
  expect(second.status).toBe(503);
  expect(requests).toBe(1);
  expect(second.headers.get("Cache-Control")).toBe("no-store");
});

test("Simultaneous normal and compact views share one profile refresh", async () => {
  const app = await application();
  const png = await createCanvas(400, 63).encode("png");
  await app.images.put("last-good.png", png);
  app.state.publish("Active_User", "last-good.png", "last-good.png", null);
  app.state.db.run("UPDATE signatures SET updated = 0");
  const pending = Promise.withResolvers<Profile>();
  let requests = 0;
  const signatures = new Signatures(app.state, app.images, () => {
    requests++;
    return pending.promise;
  });
  const handler = createHandler(signatures, app.directory);
  const normal = await handler(
    new Request("http://localhost/?/view?username=Active_User&style=normal"),
  );
  const compact = await handler(
    new Request("http://localhost/?/view?username=active_user&style=small"),
  );
  expect(normal.status).toBe(200);
  expect(compact.status).toBe(200);
  expect(requests).toBe(1);
  pending.reject(new ProfileError("Profile unavailable", 404));
  await signatures.drain();
  expect(app.state.retry("Active_User")?.failures).toBe(1);
});

test("Generation admission is bounded and survives a process restart", async () => {
  const app = await application();
  const budget = { bucket: "new", limit: 2, seconds: 60 };
  expect(app.state.admit(budget)).toBe(0);
  expect(app.state.admit(budget)).toBe(0);
  const reopened = new State(app.directory);
  cleanups.push(async () => reopened.close());
  expect(reopened.admit(budget)).toBeGreaterThan(0);
  expect(reopened.admit({ bucket: "refresh", limit: 2, seconds: 60 })).toBe(0);
  reopened.db.run("UPDATE generation_windows SET window = window - 1");
  expect(reopened.admit(budget)).toBe(0);
});

test("Exhausted admission blocks new lookups but preserves cached and negative results", async () => {
  const app = await application();
  app.state.publish("Cached_User", "normal.png", "small.png", null);
  app.state.defer("Missing_User", new ProfileError("Not found", 404));
  const { bucket, seconds, limit } = generationLimits.new;
  app.state.db
    .query("INSERT INTO generation_windows VALUES (?, ?, ?)")
    .run(bucket, Math.floor(Date.now() / (seconds * 1000)), limit);
  let requests = 0;
  const signatures = new Signatures(app.state, app.images, async () => {
    requests++;
    throw new ProfileError("Not found", 404);
  });
  const handler = createHandler(signatures, app.directory);
  const response = await handler(
    new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "New_User" }),
    }),
  );
  expect(response.status).toBe(429);
  expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  expect((await signatures.generate("Cached_User")).username).toBe(
    "Cached_User",
  );
  await expect(signatures.generate("Missing_User")).rejects.toMatchObject({
    status: 404,
  });
  expect(requests).toBe(0);
});

test("An unchanged input fingerprint bypasses image decoding and keeps the published PNGs", async () => {
  const app = await application();
  const profile: Profile = {
    username: "Unchanged_User",
    days: "42.5",
    episodes: "2,718",
    avatar: "https://cdn.myanimelist.net/avatar.jpg",
    anime: [
      {
        title: "Unchanged anime",
        image: "https://cdn.myanimelist.net/cover.jpg",
      },
    ],
  };
  const source = new TextEncoder().encode(
    "These bytes must not be decoded on an unchanged refresh.",
  );
  const inputHash = await renderInputHash(profile, source, source);
  const png = await createCanvas(400, 63).encode("png");
  await app.images.put("published.png", png);
  app.state.publish(
    profile.username,
    "published.png",
    "published.png",
    inputHash,
  );
  app.state.db.run("UPDATE signatures SET updated = 0");
  const signatures = new Signatures(
    app.state,
    app.images,
    async () => profile,
    async () => ({ avatar: source, background: source }),
  );
  const refreshed = await signatures.generate(profile.username);
  expect(refreshed).toMatchObject({
    normal: "published.png",
    small: "published.png",
    input_hash: inputHash,
  });
  expect(refreshed.updated).toBeGreaterThan(0);
  expect(
    await Bun.file(join(app.directory, "images/published.png")).bytes(),
  ).toEqual(new Uint8Array(png));
});

test("Changed image bytes at the same URL invalidate the render fingerprint", async () => {
  const app = await application();
  const profile: Profile = {
    username: "Changed_User",
    days: "12.3",
    episodes: "456",
    avatar: "https://cdn.myanimelist.net/avatar.jpg",
    anime: [
      { title: "An anime", image: "https://cdn.myanimelist.net/cover.jpg" },
    ],
  };
  const canvas = createCanvas(100, 100);
  const context = canvas.getContext("2d");
  context.fillStyle = "red";
  context.fillRect(0, 0, 100, 100);
  let bytes = await canvas.encode("png");
  const signatures = new Signatures(
    app.state,
    app.images,
    async () => profile,
    async () => ({ avatar: bytes, background: bytes }),
  );
  const first = await signatures.generate(profile.username);
  context.fillStyle = "blue";
  context.fillRect(0, 0, 100, 100);
  bytes = await canvas.encode("png");
  app.state.db.run("UPDATE signatures SET updated = 0");
  const changed = await signatures.generate(profile.username);
  expect(changed.input_hash).not.toBe(first.input_hash);
  expect(changed.normal).not.toBe(first.normal);
  expect(changed.small).not.toBe(first.small);
});

test("Display fields invalidate the render fingerprint but source URL spelling does not", async () => {
  const profile: Profile = {
    username: "Profile_User",
    days: "7.2",
    episodes: "109",
    avatar: "https://cdn.myanimelist.net/avatar.jpg",
    anime: [
      { title: "Anime title", image: "https://cdn.myanimelist.net/cover.jpg" },
    ],
  };
  const bytes = new Uint8Array([13, 37, 91]);
  const original = await renderInputHash(profile, bytes, bytes);
  for (const changed of [
    { ...profile, username: "profile_user" },
    { ...profile, days: "8.3" },
    { ...profile, episodes: "110" },
    { ...profile, anime: [{ ...profile.anime[0], title: "Another title" }] },
  ]) {
    expect(await renderInputHash(changed, bytes, bytes)).not.toBe(original);
  }
  expect(
    await renderInputHash(
      { ...profile, avatar: `${profile.avatar}?v=2` },
      bytes,
      bytes,
    ),
  ).toBe(original);
});

test("A matching fingerprint does not suppress regeneration after pruning", async () => {
  const app = await application();
  const profile: Profile = {
    username: "Pruned_User",
    days: "26.1",
    episodes: "1,234",
    avatar: "https://cdn.myanimelist.net/avatar.jpg",
    anime: [
      { title: "An anime", image: "https://cdn.myanimelist.net/cover.jpg" },
    ],
  };
  const bytes = await createCanvas(100, 100).encode("png");
  const signatures = new Signatures(
    app.state,
    app.images,
    async () => profile,
    async () => ({ avatar: bytes, background: bytes }),
  );
  const first = await signatures.generate(profile.username);
  app.state.db.run("UPDATE signatures SET last_seen = 0");
  await prune(app.state, app.images, join(app.directory, "cache"));
  const regenerated = await signatures.generate(profile.username);
  expect(regenerated.input_hash).toBe(first.input_hash);
  expect(regenerated.small).not.toBe(first.small);
  expect(
    await Bun.file(`${app.directory}/images/${regenerated.small}`).exists(),
  ).toBe(true);
});

test("Pruning removes inactive PNGs but retains accounts, totals and active images", async () => {
  const app = await application();
  const png = await createCanvas(400, 63).encode("png");
  for (const key of ["idle.png", "active.png"]) await app.images.put(key, png);
  app.state.publish("Idle_User", "idle.png", "idle.png", null);
  app.state.publish("Active_User", "active.png", "active.png", null);
  app.state.db
    .query(
      "UPDATE signatures SET last_seen = ?, views = 719 WHERE username = ?",
    )
    .run(Date.now() - 31 * 86400_000, "Idle_User");
  const removed = await prune(
    app.state,
    app.images,
    join(app.directory, "cache"),
  );
  expect(removed.images).toBe(1);
  expect(await Bun.file(join(app.directory, "images/idle.png")).exists()).toBe(
    false,
  );
  expect(
    await Bun.file(join(app.directory, "images/active.png")).exists(),
  ).toBe(true);
  expect(app.state.get("Idle_User")).toMatchObject({
    views: 719,
    normal: null,
    small: null,
  });
});

test("Publishing a refresh does not count as a new view or keep an inactive account alive", async () => {
  const app = await application();
  app.state.publish("Idle_User", "old-normal.png", "old-small.png", "old");
  app.state.db
    .query("UPDATE signatures SET last_seen = ?, views = 17")
    .run(Date.now() - 31 * 86400_000);
  const before = app.state.get("Idle_User");
  app.state.publish("Idle_User", "new-normal.png", "new-small.png", "new");
  expect(app.state.get("Idle_User")).toMatchObject({
    views: 17,
    last_seen: before?.last_seen,
  });
  expect(app.state.prune(Date.now() - 30 * 86400_000)).toEqual([
    "new-normal.png",
    "new-small.png",
  ]);
});

test("An old account whose PNG was pruned can request generation through its existing embed", async () => {
  const app = await application();
  app.state.importRanking({
    updatedAt: "2026-10-13T00:00:00Z",
    entries: [["Dormant_User", 18]],
  });
  let requests = 0;
  const signatures = new Signatures(app.state, app.images, async () => {
    requests++;
    throw new ProfileError("This profile was deleted", 404);
  });
  const handler = createHandler(signatures, app.directory);
  const response = await handler(
    new Request("http://localhost/view.php?a=Dormant_User&b=1"),
  );
  expect(response.status).toBe(404);
  expect(response.headers.get("Location")).toBeNull();
  expect(requests).toBe(1);
  const unknown = await handler(
    new Request("http://localhost/view.php?a=Never_Registered"),
  );
  expect(unknown.status).toBe(404);
  expect(requests).toBe(1);
});

test("Ranking entries and pagination are present in initial HTML and escape names", () => {
  const entries: [string, number][] = Array.from({ length: 101 }, (_, i) => [
    `User${i}`,
    100 - i,
  ]);
  entries[0] = ['<script>alert("x")</script>', 54.3];
  const page = rankingPage({ updatedAt: "2026-10-13T00:00:00Z", entries }, 1);
  expect(page).toContain("&lt;script&gt;");
  expect(page).not.toContain('<script>alert("x")</script>');
  expect(page).toContain('href="/ranking/page/2/"');
  expect(page).toContain('scope="row"');
  expect(page).toContain('class="popularity-score">54.3</span>');
  expect(page).toContain('style="width:54.3%"');
  expect(page).toContain('class="numeric">Popularity</th>');
  expect(page).toContain(
    'rel="canonical" href="https://malsignature.com/ranking/"',
  );
  expect(page).not.toContain('<meta name="robots" content="noindex">');
  expect(page).toContain('href="/ranking/page/2/" rel="nofollow"');
  const laterPage = rankingPage(
    { updatedAt: "2026-10-13T00:00:00Z", entries },
    2,
  );
  expect(laterPage).toContain('<meta name="robots" content="noindex">');
  expect(laterPage).toContain('href="/ranking/"');
});

test("Render both legacy image sizes with the real font and native renderer", async () => {
  const input = createCanvas(300, 450);
  const context = input.getContext("2d");
  context.fillStyle = "#5363c8";
  context.fillRect(0, 0, 300, 450);
  const bytes = await input.encode("png");
  const rendered = await renderImages(
    {
      username: "A_Long_Username_123456",
      days: "35.4",
      episodes: "2,456",
      avatar: "unused",
      anime: [
        {
          title: "A long anime title with Unicode ♦ & punctuation",
          image: "unused",
        },
      ],
    },
    bytes,
    bytes,
  );
  expect(rendered.normal.readUInt32BE(16)).toBe(400);
  expect(rendered.normal.readUInt32BE(20)).toBe(135);
  expect(rendered.small.readUInt32BE(16)).toBe(400);
  expect(rendered.small.readUInt32BE(20)).toBe(63);
  for (const bytes of Object.values(rendered)) {
    const decoded = await loadImage(bytes);
    const canvas = createCanvas(decoded.width, decoded.height);
    const context = canvas.getContext("2d");
    context.drawImage(decoded, 0, 0);
    expect(Array.from(context.getImageData(30, 30, 1, 1).data)).toEqual([
      83, 99, 200, 255,
    ]);
    expect(Array.from(context.getImageData(0, 0, 1, 1).data)).toEqual([
      0, 0, 0, 255,
    ]);
  }
});
