import { resolve } from "node:path";

export const stateDirectory = resolve(process.env.STATE_DIRECTORY || ".data");
export const publicDirectory = resolve(process.env.PUBLIC_DIRECTORY || "dist");
export const origin = process.env.SITE_ORIGIN || "https://malsignature.com";
export const freshnessSeconds =
  Number(process.env.FRESHNESS_SECONDS) || 60 * 60;
export const stateFlushIntervalMs =
  Number(process.env.STATE_FLUSH_MS) || 15_000;
export const generationLimits = {
  concurrent: Number(process.env.MAX_CONCURRENT_RENDERS) || 2,
  new: { bucket: "new-minute", limit: 20, seconds: 60 },
  refresh: { bucket: "refresh-minute", limit: 60, seconds: 60 },
};
export const pageSize = 100;
export const assetDirectory = resolve(import.meta.dir, "../assets");
