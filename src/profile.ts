import { decodeHTML } from "entities";

export class ProfileError extends Error {
  constructor(
    message: string,
    public status = 502,
    public retryAfter = 0,
  ) {
    super(message);
  }
}

export interface Profile {
  username: string;
  days: string;
  episodes: string;
  avatar: string;
  anime: { title: string; image: string }[];
}

export function usernameInput(value: string): string {
  const username = value.trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(username)) {
    throw new ProfileError(
      "Enter your MyAnimeList username, not a profile URL.",
      400,
    );
  }
  return username;
}

export async function parseProfile(
  html: string,
  requested: string,
): Promise<Profile> {
  let title = "";
  let avatar = "";
  let days = "";
  const stats: string[] = [];
  const anime: Profile["anime"] = [];
  const parser = new HTMLRewriter()
    .on("title", {
      text(chunk) {
        title += chunk.text;
      },
    })
    .on(".user-image img", {
      element(element) {
        avatar =
          element.getAttribute("data-src") || element.getAttribute("src") || "";
      },
    })
    .on(".stats.anime .di-tc", {
      text(chunk) {
        days += chunk.text;
      },
    })
    .on(".stats.anime .stats-data li", {
      element() {
        stats.push("");
      },
      text(chunk) {
        stats[stats.length - 1] += chunk.text;
      },
    })
    .on(".updates.anime img", {
      element(element) {
        const image =
          element.getAttribute("data-src") || element.getAttribute("src") || "";
        const name = element.getAttribute("alt") || "";
        if (image && name)
          anime.push({ image: decodeHTML(image), title: decodeHTML(name) });
      },
    });
  await parser.transform(new Response(html)).text();
  const matched = decodeHTML(title)
    .trim()
    .match(/^(.*?)'s Profile/);
  if (!matched || matched[1].toLowerCase() !== requested.toLowerCase()) {
    throw new ProfileError(
      "MyAnimeList did not return this profile. Check the username or try again later.",
      404,
    );
  }
  const dayCount = decodeHTML(days).match(/Days:\s*([\d,.]+)/)?.[1];
  const episodes = stats
    .map((value) => decodeHTML(value))
    .find((value) => value.includes("Episodes"))
    ?.match(/Episodes\s*([\d,]+)/)?.[1];
  if (!avatar || !anime.length) {
    throw new ProfileError(
      "This profile needs a profile picture and public anime updates to make a signature.",
      422,
    );
  }
  if (!dayCount || !episodes) {
    throw new Error("MyAnimeList profile statistics could not be parsed");
  }
  return {
    username: matched[1],
    avatar: decodeHTML(avatar),
    days: dayCount,
    episodes,
    anime: anime.slice(0, 3),
  };
}

export async function fetchProfile(username: string): Promise<Profile> {
  const response = await fetchMyAnimeList(
    `https://myanimelist.net/profile/${encodeURIComponent(username)}`,
    "profile",
  );
  return parseProfile(await response.text(), username);
}

export async function fetchMyAnimeList(
  url: string | URL,
  resource: "profile" | "image",
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "MALSignature (+https://malsignature.com)" },
      signal: AbortSignal.timeout(resource === "profile" ? 20_000 : 15_000),
      redirect: resource === "image" ? "error" : "follow",
    });
  } catch {
    throw new ProfileError(
      "MyAnimeList could not be reached. Please try again later.",
      503,
    );
  }
  if (!response.ok) {
    const retry = response.headers.get("Retry-After");
    const retryAfter = retry
      ? Math.max(
          0,
          /^\d+$/.test(retry)
            ? Number(retry)
            : Math.ceil((Date.parse(retry) - Date.now()) / 1000) || 0,
        )
      : 0;
    const missing = response.status === 404 || response.status === 410;
    throw new ProfileError(
      missing
        ? resource === "profile"
          ? "This profile may have been renamed or deleted. Check the username."
          : "This profile’s image is no longer available."
        : "MyAnimeList is unavailable right now. Please try again later.",
      missing ? response.status : response.status === 429 ? 429 : 503,
      retryAfter,
    );
  }
  return response;
}
