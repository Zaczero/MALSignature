import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createCanvas,
  GlobalFonts,
  loadImage,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import sharp from "sharp";
import { assetDirectory, stateDirectory } from "./config";
import { fetchMyAnimeList, type Profile } from "./profile";

if (
  !GlobalFonts.registerFromPath(
    join(assetDirectory, "Rounded_Elegance.ttf"),
    "Rounded Elegance",
  )
) {
  throw new Error("Cannot load the signature font");
}
const watermark = loadImage(join(assetDirectory, "watermark.png"));
const rendererRevision = Promise.all([
  Bun.file(import.meta.path).bytes(),
  Bun.file(join(assetDirectory, "Rounded_Elegance.ttf")).bytes(),
  Bun.file(join(assetDirectory, "watermark.png")).bytes(),
  Bun.file(new URL(import.meta.resolve("@napi-rs/canvas/package.json"))).json(),
]).then(([source, font, mark, canvasPackage]) =>
  Bun.hash
    .xxHash3(
      Buffer.concat([
        source,
        font,
        mark,
        Buffer.from(JSON.stringify([canvasPackage.version, sharp.versions])),
      ]),
    )
    .toString(16),
);
const sourceImages = new Map<string, Promise<Uint8Array>>();

async function imageBytes(url: string): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    ![
      "cdn.myanimelist.net",
      "myanimelist.net",
      "akamai-origin.myanimelist.net",
    ].includes(parsed.hostname)
  ) {
    throw new Error("MyAnimeList returned an unsupported image host");
  }
  const pending = sourceImages.get(url);
  if (pending) return pending;
  const load = async () => {
    const directory = join(stateDirectory, "cache");
    const key = Bun.hash.xxHash3(url).toString(16);
    const path = join(directory, key);
    const cached = Bun.file(path);
    if ((await cached.exists()) && Date.now() - cached.lastModified < 86400_000)
      return cached.bytes();
    const response = await fetchMyAnimeList(parsed, "image");
    const bytes = new Uint8Array(await response.arrayBuffer());
    await mkdir(directory, { recursive: true });
    const temporary = `${path}.${crypto.randomUUID()}.tmp`;
    try {
      await Bun.write(temporary, bytes);
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
    return bytes;
  };
  const work = load().finally(() => sourceImages.delete(url));
  sourceImages.set(url, work);
  return work;
}

function text(
  ctx: SKRSContext2D,
  value: string,
  points: number,
  x: number,
  y: number,
  bold = false,
) {
  ctx.font = `${(points * 4) / 3}px "Rounded Elegance"`;
  ctx.fillStyle = "#000";
  ctx.fillText(value, x + 1, y + 1);
  if (bold) ctx.fillText(value, x + 2, y + 1);
  ctx.fillStyle = "#fff";
  ctx.fillText(value, x, y);
  if (bold) ctx.fillText(value, x + 1, y);
}

export async function renderImages(
  profile: Profile,
  avatarBytes: Uint8Array,
  backgroundBytes: Uint8Array,
) {
  const [avatar, background, mark] = await Promise.all([
    loadImage(avatarBytes),
    loadImage(backgroundBytes),
    watermark,
  ]);
  const result = {} as Record<"normal" | "small", Buffer>;
  for (const [style, height] of [
    ["normal", 135],
    ["small", 63],
  ] as const) {
    const canvas = createCanvas(400, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 400, height);
    const backgroundHeight = (background.height * 396) / background.width;
    ctx.save();
    ctx.beginPath();
    ctx.rect(2, 2, 396, height - 4);
    ctx.clip();
    ctx.filter = "blur(3px)";
    ctx.drawImage(background, 2, 2 - 210, 396, backgroundHeight);
    ctx.restore();
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - 95 / 127})`;
    ctx.fillRect(0, 0, 400, height);
    ctx.fillStyle = "#000";
    ctx.fillRect(6, 6, 51, 51);
    const side = Math.min(avatar.width, avatar.height);
    ctx.drawImage(
      avatar,
      (avatar.width - side) / 2,
      0,
      side,
      side,
      7,
      7,
      49,
      49,
    );
    let size = 16;
    while (size > 5) {
      ctx.font = `${(size * 4) / 3}px "Rounded Elegance"`;
      if (ctx.measureText(profile.username).width <= 170) break;
      size -= 0.5;
    }
    text(ctx, profile.username, size, 62, 29, true);
    text(ctx, "MyAnimeList.net", 12, 62, 48);
    text(ctx, `Episodes: ${profile.episodes}`, 14, 236, 29);
    text(ctx, `Days: ${profile.days}`, 14, 236, 50);
    if (style === "normal") {
      for (const [index, anime] of profile.anime.entries()) {
        ctx.font = '20px "Rounded Elegance"';
        const letters = Array.from(anime.title);
        let value = anime.title;
        while (ctx.measureText(value).width > 300 && letters.length) {
          letters.pop();
          value = `${letters.join("").trim()}...`;
        }
        text(ctx, `♦ ${value}`, 15, 8, 80 + 22 * index);
      }
      ctx.drawImage(mark, 333, 85, 60, 60);
    }
    result[style] = await sharp(canvas.data(), {
      raw: { width: 400, height, channels: 4 },
    })
      .removeAlpha()
      .png({ compressionLevel: 3, adaptiveFiltering: true })
      .toBuffer();
  }
  return result;
}

export async function loadProfileImages(profile: Profile) {
  const background = new URL(profile.anime[0].image);
  background.pathname = background.pathname.replace(/^\/r\/\d+x\d+\//, "/");
  background.search = "";
  const [avatar, cover] = await Promise.all([
    imageBytes(profile.avatar),
    imageBytes(background.href),
  ]);
  return { avatar, background: cover };
}

export async function renderInputHash(
  profile: Profile,
  avatar: Uint8Array,
  background: Uint8Array,
) {
  return Bun.hash
    .xxHash3(
      JSON.stringify([
        await rendererRevision,
        profile.username,
        profile.days,
        profile.episodes,
        profile.anime.map((anime) => anime.title),
        Bun.hash.xxHash3(avatar).toString(16),
        Bun.hash.xxHash3(background).toString(16),
      ]),
    )
    .toString(16);
}
