import { ProfileError, usernameInput } from "./profile";
import { imageRoute } from "./routes";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function imageAccess(
  line: string,
): { username: string; time: number } | null {
  let record: unknown = JSON.parse(line);
  if (object(record) && typeof record.MESSAGE === "string")
    record = JSON.parse(record.MESSAGE);
  if (!object(record) || !object(record.request)) return null;
  const request = record.request;
  if (
    request.host !== "malsignature.com" ||
    request.method !== "GET" ||
    (record.status !== 200 && record.status !== 304) ||
    typeof request.uri !== "string" ||
    typeof record.ts !== "number" ||
    !Number.isFinite(record.ts)
  )
    return null;
  const time = Math.floor(record.ts * 1000);
  if (!Number.isSafeInteger(time) || time < 0) return null;
  const image = imageRoute(new URL(request.uri, "https://malsignature.com"));
  if (!image) return null;
  try {
    return { username: usernameInput(image.username), time };
  } catch (error) {
    if (!(error instanceof ProfileError)) throw error;
    return null;
  }
}
