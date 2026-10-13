import { resolve } from "node:path";

export const stateDirectory = resolve(process.env.STATE_DIRECTORY || ".data");
export const publicDirectory = resolve(process.env.PUBLIC_DIRECTORY || "dist");
export const origin = process.env.SITE_ORIGIN || "https://malsignature.com";
export const freshnessSeconds = 60 * 60;
export const generationLimits = {
  concurrent: 4,
  new: { bucket: "new-minute", limit: 20, seconds: 60 },
  refresh: { bucket: "refresh-minute", limit: 60, seconds: 60 },
};
export const pageSize = 100;
export const assetDirectory = resolve(import.meta.dir, "../assets");
