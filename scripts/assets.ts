import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { assetDirectory } from "../src/config";

function encodeIco(images: { size: number; data: Uint8Array }[]): Uint8Array {
  const headerSize = 6 + images.length * 16;
  const totalSize = images.reduce(
    (sum, image) => sum + image.data.length,
    headerSize,
  );
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);
  let offset = headerSize;
  for (const [index, image] of images.entries()) {
    const entry = 6 + index * 16;
    const dimension = image.size >= 256 ? 0 : image.size;
    buffer[entry] = dimension;
    buffer[entry + 1] = dimension;
    buffer[entry + 2] = 0;
    buffer[entry + 3] = 0;
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, image.data.length, true);
    view.setUint32(entry + 12, offset, true);
    buffer.set(image.data, offset);
    offset += image.data.length;
  }
  return buffer;
}

export async function buildAssets(directory: string) {
  const paths = new Map<string, string>();
  const write = async (name: string, content: Uint8Array | string) => {
    const hash = Bun.hash.xxHash3(content).toString(16);
    const filename = name.replace(/(\.[^.]+)$/, `.${hash}$1`);
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
  const favicon =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#c7b8ff"/><path d="m16 3 3.5 9.5L29 16l-9.5 3.5L16 29l-3.5-9.5L3 16l9.5-3.5Z" fill="#17192f"/></svg>';
  await write("favicon.svg", favicon);
  const icoImages: { size: number; data: Uint8Array }[] = [];
  for (const size of [16, 32, 48, 180]) {
    const png = await sharp(Buffer.from(favicon))
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();
    await write(`favicon-${size}.png`, png);
    if (size === 16 || size === 32) icoImages.push({ size, data: png });
  }
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
  await write(
    "social.png",
    await sharp(card.data(), {
      raw: { width: 1200, height: 630, channels: 4 },
    })
      .removeAlpha()
      .png({ palette: true, compressionLevel: 9, effort: 10 })
      .toBuffer(),
  );
  return {
    rewrite(content: string) {
      for (const [original, versioned] of paths)
        content = content.replaceAll(original, versioned);
      return content;
    },
    faviconIco: encodeIco(icoImages),
  };
}
