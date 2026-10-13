/** biome-ignore-all lint/style/noNonNullAssertion: Required elements and data attributes are owned by the shared page templates. */
import type { RankingSearchIndex } from "../src/ranking-search";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};
const analytics = window as AnalyticsWindow;
let monitoring: typeof import("./monitoring") | undefined;
void import("./monitoring")
  .then((module) => {
    monitoring = module;
  })
  .catch(() => {});

function announce(message: string) {
  const region = document.querySelector("#announcement");
  if (region) region.textContent = message;
}
function event(name: string, details: Record<string, string> = {}) {
  analytics.gtag?.("event", name, details);
}
function pageView() {
  analytics.gtag?.("event", "page_view", {
    page_location: location.origin + location.pathname,
    page_title: document.title,
  });
}

const measurementId = document.querySelector<HTMLMetaElement>(
  'meta[name="analytics-id"]',
)?.content;
if (measurementId && location.hostname === "malsignature.com") {
  analytics.dataLayer = [];
  analytics.gtag = function () {
    // biome-ignore lint/complexity/noArguments: Google tag commands use the native Arguments object.
    analytics.dataLayer?.push(arguments);
  };
  analytics.gtag("js", new Date());
  analytics.gtag("config", measurementId, { send_page_view: false });
  const script = document.createElement("script");
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.async = true;
  document.head.append(script);
  pageView();
}

let navigation: AbortController | undefined;
history.scrollRestoration = "manual";
document.addEventListener("scrollend", () => {
  history.replaceState({ ...history.state, scrollY: window.scrollY }, "");
});

async function navigate(href: string, push = true) {
  navigation?.abort();
  const controller = new AbortController();
  navigation = controller;
  const previousY = history.state?.scrollY || 0;
  try {
    const response = await fetch(href, { signal: controller.signal });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("text/html")
    ) {
      location.assign(href);
      return;
    }
    const documentNext = new DOMParser().parseFromString(
      await response.text(),
      "text/html",
    );
    if (controller.signal.aborted) return;
    const nextMain = documentNext.querySelector("main");
    if (!nextMain) {
      location.assign(href);
      return;
    }
    const rankingNavigation = Boolean(
      document.querySelector(".ranking-panel") &&
        nextMain.querySelector(".ranking-panel"),
    );
    const reducedMotion = matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (push) {
      history.replaceState({ ...history.state, scrollY: window.scrollY }, "");
      history.pushState({ scrollY: window.scrollY }, "", href);
    }
    const update = () => {
      if (controller.signal.aborted) return;
      document.querySelector("main")?.replaceWith(nextMain);
      document.title = documentNext.title;
      for (const selector of [
        'link[rel="canonical"]',
        'meta[name="description"]',
        'meta[name="robots"]',
        'meta[name="ranking-index"]',
        'meta[property^="og:"]',
      ]) {
        document.querySelectorAll(selector).forEach((element) => {
          element.remove();
        });
        for (const element of documentNext.querySelectorAll(selector))
          document.head.append(element.cloneNode(true));
      }
      for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
        ".site-header nav a",
      )) {
        if (
          documentNext.querySelector(
            `.site-header nav a[href="${anchor.getAttribute("href")}"][aria-current]`,
          )
        ) {
          anchor.setAttribute("aria-current", "page");
        } else {
          anchor.removeAttribute("aria-current");
        }
      }
      initializeResult();
      const heading = document.querySelector<HTMLElement>("h1");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
      if (!push) {
        window.scrollTo({ top: previousY, behavior: "instant" });
      } else if (rankingNavigation) {
        const behavior = reducedMotion ? "instant" : "smooth";
        if (!scrollToUser(behavior))
          nextMain
            .querySelector(".ranking-panel")!
            .scrollIntoView({ block: "start", behavior });
      } else {
        window.scrollTo({ top: 0, behavior: "instant" });
        scrollToUser();
      }
    };
    if (document.startViewTransition && !rankingNavigation && !reducedMotion) {
      const transition = document.startViewTransition(update);
      // A newer navigation can skip the animation without cancelling its update.
      await Promise.all([
        transition.ready.catch(() => {}),
        transition.updateCallbackDone,
        transition.finished,
      ]);
    } else update();
    if (controller.signal.aborted) return;
    announce(document.title);
    pageView();
  } catch (error) {
    if (controller.signal.aborted) return;
    if (error instanceof DOMException && error.name === "AbortError") return;
    monitoring?.reportError(error);
    location.assign(href);
  }
}

window.addEventListener("popstate", () => {
  void navigate(location.href, false);
});
document.addEventListener("click", (event) => {
  const target = event.target as Element;
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (
    !anchor ||
    anchor.target ||
    anchor.hasAttribute("download") ||
    event.button ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const url = new URL(anchor.href);
  if (
    url.origin !== location.origin ||
    url.search.startsWith("?/view") ||
    url.pathname.startsWith("/assets/")
  )
    return;
  if (url.pathname === location.pathname && url.hash) return;
  if (
    url.pathname !== "/" &&
    !url.pathname.startsWith("/ranking/") &&
    url.pathname !== "/signature/"
  )
    return;
  event.preventDefault();
  void navigate(url.href);
});

document.addEventListener("submit", (event) => {
  const form = event.target as HTMLFormElement;
  if (form.id === "generate-form") {
    event.preventDefault();
    void generate(form);
  } else if (form.id === "search-form") {
    event.preventDefault();
    void search(form);
  }
});

async function generate(form: HTMLFormElement) {
  const button = form.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  )!;
  const label = button.querySelector("span")!;
  const input = form.querySelector<HTMLInputElement>("#username")!;
  const errorBox = form.querySelector<HTMLElement>("#form-error")!;
  errorBox.textContent = "";
  input.removeAttribute("aria-invalid");
  button.disabled = true;
  label.textContent = "Making it yours…";
  form.setAttribute("aria-busy", "true");
  announce("Fetching your profile and making both signatures.");
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: input.value.trim() }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await response.json()) as {
      username?: string;
      error?: string;
    };
    if (!response.ok || !data.username) {
      errorBox.textContent =
        data.error || "We couldn’t make your signature. Please try again.";
      const retryAfter = Number(response.headers.get("Retry-After"));
      if (retryAfter > 0) {
        const retryTime = new Date(Date.now() + retryAfter * 1000);
        errorBox.textContent += ` Next check: ${retryTime.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.`;
      }
      input.setAttribute("aria-invalid", "true");
      return;
    }
    event("signature_generated");
    if (form.isConnected)
      await navigate(
        `/signature/?username=${encodeURIComponent(data.username)}&style=normal`,
      );
  } catch (error) {
    errorBox.textContent = "The connection was interrupted. Please try again.";
    monitoring?.reportError(error);
  } finally {
    button.disabled = false;
    label.textContent = "Generate my signature";
    form.removeAttribute("aria-busy");
  }
}

function initializeResult() {
  if (location.pathname !== "/signature/") return;
  const username = new URLSearchParams(location.search).get("username");
  if (!username) return;
  const style =
    new URLSearchParams(location.search).get("style") === "small"
      ? "small"
      : "normal";
  const imagePath = `/?/view?username=${encodeURIComponent(username)}&style=${style}`;
  const imageUrl = `https://malsignature.com${imagePath}`;
  const preview = document.querySelector("#result-preview")!;
  const image = document.createElement("img");
  const height = style === "small" ? 63 : 135;
  image.src = imagePath;
  image.width = 400;
  image.height = height;
  image.alt = `${username}’s ${style === "small" ? "compact" : "normal"} MyAnimeList signature`;
  image.addEventListener("error", () => {
    preview.textContent =
      "The signature isn’t available yet. Go back to the generator and try again.";
  });
  preview.replaceChildren(image);
  document.querySelector("#result-description")!.textContent =
    `Made for ${username}. Ready for wherever you call home.`;
  document.querySelector("#result-size")!.textContent =
    `${style === "small" ? "Compact" : "Normal"} · 400 × ${height} pixels · PNG`;
  const values = {
    url: imageUrl,
    bbcode: `[URL="https://malsignature.com/"][IMG]${imageUrl}[/IMG][/URL]`,
    html: `<a href="https://malsignature.com/"><img src="${imageUrl.replaceAll("&", "&amp;")}" alt="${username.replaceAll('"', "&quot;")}’s MyAnimeList signature"></a>`,
  };
  for (const [key, value] of Object.entries(values))
    document.querySelector<HTMLInputElement>(`#embed-${key}`)!.value = value;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-style]",
  )) {
    button.setAttribute("aria-pressed", String(button.dataset.style === style));
  }
}

document.addEventListener("click", async (click) => {
  const target = click.target as Element;
  const style = target.closest<HTMLButtonElement>("[data-style]");
  if (style && style.getAttribute("aria-pressed") !== "true") {
    const url = new URL(location.href);
    url.searchParams.set("style", style.dataset.style!);
    history.replaceState(history.state, "", url);
    initializeResult();
    announce(`${style.textContent} signature selected.`);
  }
  const copy = target.closest<HTMLButtonElement>("[data-copy]");
  if (copy) {
    const input = document.querySelector<HTMLInputElement>(
      `#embed-${copy.dataset.copy}`,
    )!;
    try {
      await navigator.clipboard.writeText(input.value);
      announce(`${copy.getAttribute("aria-label")} copied.`);
      const span = copy.querySelector("span")!;
      span.textContent = "Copied";
      copy.dataset.copied = "";
      setTimeout(() => {
        span.textContent = "Copy";
        delete copy.dataset.copied;
      }, 2000);
      event("embed_copied", { format: copy.dataset.copy! });
    } catch {
      input.focus();
      input.select();
      announce(
        "Copy is unavailable. The code is selected; use your device’s copy command.",
      );
    }
  }
});

async function search(form: HTMLFormElement) {
  const input = form.querySelector<HTMLInputElement>("input")!;
  const query = input.value.trim().toLowerCase();
  const message = document.querySelector("#search-message")!;
  if (!query) {
    input.focus();
    return;
  }
  message.textContent = "Finding your place…";
  const notFound =
    "That username isn’t in this snapshot. New signatures appear with the next daily update.";
  try {
    const directory = document.querySelector<HTMLMetaElement>(
      'meta[name="ranking-index"]',
    )!.content;
    const response = await fetch(
      `${directory}${encodeURIComponent(query.slice(0, 2))}.json`,
    );
    if (!form.isConnected) return;
    if (response.status === 404) {
      message.textContent = notFound;
      return;
    }
    if (!response.ok) throw new Error("Ranking unavailable");
    const data = (await response.json()) as RankingSearchIndex;
    if (!form.isConnected) return;
    const entry = data.entries.find(
      ([username]) => username.toLowerCase() === query,
    );
    if (!entry) {
      message.textContent = notFound;
      return;
    }
    const [username, rank] = entry;
    const page = Math.ceil(rank / data.pageSize);
    const path = page === 1 ? "/ranking/" : `/ranking/page/${page}/`;
    await navigate(`${path}#user-${encodeURIComponent(query)}`);
    announce(`Found ${username} at rank ${rank}.`);
  } catch (error) {
    message.textContent = "The ranking could not be loaded. Please try again.";
    monitoring?.reportError(error);
  }
}

function scrollToUser(behavior: ScrollBehavior = "instant") {
  if (!location.hash.startsWith("#user-")) return false;
  const row = document.getElementById(
    decodeURIComponent(location.hash.slice(1)),
  );
  if (row) {
    const bounds = row.getBoundingClientRect();
    const highlight = () => {
      if (row.isConnected) row.classList.add("search-match");
    };
    if (
      behavior === "smooth" &&
      (bounds.bottom <= 0 || bounds.top >= window.innerHeight)
    ) {
      document.addEventListener("scrollend", highlight, {
        once: true,
        signal: navigation?.signal,
      });
    } else highlight();
    row.scrollIntoView({ block: "center", behavior });
    row.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
    return true;
  }
  return false;
}
initializeResult();
scrollToUser();
