import * as Sentry from "@sentry/bun";
import { freshnessSeconds, generationLimits } from "./config";
import type { Images } from "./images";
import { fetchProfile, ProfileError, usernameInput } from "./profile";
import { loadProfileImages, renderImages, renderInputHash } from "./render";
import type { Signature, State } from "./state";

export class Signatures {
  private readonly pending = new Map<string, Promise<Signature>>();
  constructor(
    readonly state: State,
    readonly images: Images,
    readonly profileSource: typeof fetchProfile = fetchProfile,
    readonly imageSource: typeof loadProfileImages = loadProfileImages,
  ) {}

  async generate(value: string): Promise<Signature> {
    const username = usernameInput(value);
    return this.ensure(username, this.state.access(username, false));
  }

  private async ensure(
    username: string,
    current: Signature | null,
  ): Promise<Signature> {
    if (
      current?.normal &&
      current.small &&
      Date.now() - current.updated < freshnessSeconds * 1000
    )
      return current;
    const key = username.toLowerCase();
    const pending = this.pending.get(key);
    if (pending) return pending;
    const retry = this.state.retry(username);
    if (retry)
      throw new ProfileError(
        retry.message,
        retry.status,
        Math.ceil((retry.retry_at - Date.now()) / 1000),
      );
    if (this.pending.size >= generationLimits.concurrent) {
      throw new ProfileError(
        "The generator is busy. Please try again in a moment.",
        429,
        5,
      );
    }
    const wait = this.state.admit(
      current ? generationLimits.refresh : generationLimits.new,
    );
    if (wait)
      throw new ProfileError(
        "The generator is busy. Please try again shortly.",
        429,
        wait,
      );
    const work = this.refresh(username, current).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, work);
    return work;
  }

  async drain() {
    await Promise.allSettled(this.pending.values());
  }

  private async refresh(
    username: string,
    old: Signature | null,
  ): Promise<Signature> {
    try {
      const profile = await this.profileSource(username);
      const source = await this.imageSource(profile);
      const inputHash = await renderInputHash(
        profile,
        source.avatar,
        source.background,
      );
      if (old?.normal && old.small && old.input_hash === inputHash) {
        this.state.publish(profile.username, old.normal, old.small, inputHash);
        // biome-ignore lint/style/noNonNullAssertion: The successful publish above inserted this row.
        return this.state.get(profile.username)!;
      }
      const rendered = await renderImages(
        profile,
        source.avatar,
        source.background,
      );
      const normalHash = Bun.hash.xxHash3(rendered.normal).toString(16);
      const smallHash = Bun.hash.xxHash3(rendered.small).toString(16);
      const normal = old?.normal?.startsWith(`${normalHash}.`)
        ? old.normal
        : `${normalHash}.${crypto.randomUUID()}.png`;
      const small = old?.small?.startsWith(`${smallHash}.`)
        ? old.small
        : `${smallHash}.${crypto.randomUUID()}.png`;
      const uploads = await Promise.allSettled([
        normal === old?.normal
          ? Promise.resolve()
          : this.images.put(normal, rendered.normal),
        small === old?.small
          ? Promise.resolve()
          : this.images.put(small, rendered.small),
      ]);
      const failed = uploads.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") {
        for (const key of [normal, small]) {
          if (key !== old?.normal && key !== old?.small) {
            await this.images
              .remove(key)
              .catch((error) => console.error("Image cleanup failed:", error));
          }
        }
        throw failed.reason;
      }
      this.state.publish(profile.username, normal, small, inputHash);
      for (const previous of [old?.normal, old?.small]) {
        if (previous && previous !== normal && previous !== small) {
          this.images.retire(previous);
        }
      }
      // biome-ignore lint/style/noNonNullAssertion: The successful publish above inserted this row.
      return this.state.get(profile.username)!;
    } catch (error) {
      const retryAt = this.state.defer(username, error);
      if (error instanceof ProfileError)
        error.retryAfter = Math.ceil((retryAt - Date.now()) / 1000);
      throw error;
    }
  }

  async view(
    username: string,
    style: "normal" | "small",
    request: Request,
  ): Promise<Response> {
    username = usernameInput(username);
    let current = this.state.access(username, true);
    if (!current) {
      throw new ProfileError(
        "Generate your signature at MALSignature.com first.",
        404,
      );
    }
    if (!current[style]) current = await this.ensure(username, current);
    const key = current[style];
    if (!key) throw new Error("Signature generation did not publish an image");
    if (
      Date.now() - current.updated >= freshnessSeconds * 1000 &&
      !this.state.retry(username)
    ) {
      void this.ensure(username, current).catch((error) => {
        if (!(error instanceof ProfileError)) {
          Sentry.captureException(error);
          console.error("Signature refresh failed:", error);
        }
      });
    }
    const etag = `"${key.split(".")[0]}"`;
    const cacheSeconds = Math.max(
      60,
      Math.ceil(
        (freshnessSeconds * 1000 - (Date.now() - current.updated)) / 1000,
      ),
    );
    const headers = {
      "Content-Type": "image/png",
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=86400, stale-if-error=604800`,
      ETag: etag,
      "Last-Modified": new Date(current.updated).toUTCString(),
      "X-Content-Type-Options": "nosniff",
    };
    if (request.method === "GET")
      this.state.activity.record(current.username, Date.now());
    if (request.headers.get("If-None-Match") === etag)
      return new Response(null, { status: 304, headers });
    return new Response(
      request.method === "HEAD" ? null : this.images.get(key),
      { headers },
    );
  }
}
