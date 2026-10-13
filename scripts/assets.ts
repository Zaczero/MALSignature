import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { assetDirectory } from "../src/config";

export async function buildAssets(directory: string) {
  const paths = new Map<string, string>();
  const write = async (name: string, content: Uint8Array | string) => {
    const hash = Bun.hash.xxHash3(content).toString(16);
    const filename = name.replace(/(\.[^.]+)$/, `-${hash}$1`);
    await Bun.write(join(directory, filename), content);
    paths.set(`/assets/${name}`, `/assets/${filename}`);
  };
  const background = join(assetDirectory, "background.webp");
  await write(
    "background.webp",
    new Uint8Array(await Bun.file(background).arrayBuffer()),
  );
  await write(
    "background-medium.webp",
    await sharp(background)
      .resize({ width: 2048 })
      .webp({ quality: 90 })
      .toBuffer(),
  );
  await write(
    "background-mobile.webp",
    await sharp(background)
      .resize({
        width: 1216,
        height: 2160,
        fit: "cover",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer(),
  );
  for (const name of ["example-normal", "example-small"]) {
    await write(
      `${name}.webp`,
      await sharp(join(assetDirectory, `${name}.png`))
        .webp({ lossless: true })
        .toBuffer(),
    );
  }
  await write(
    "favicon.svg",
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
  await write("social.png", await card.encode("png"));
  return (content: string) => {
    for (const [original, versioned] of paths)
      content = content.replaceAll(original, versioned);
    return content;
  };
}
