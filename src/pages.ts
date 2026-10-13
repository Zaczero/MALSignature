import { origin, pageSize } from "./config";
import type { Ranking } from "./state";

const { escapeHTML } = Bun;
export const icon = (name: "arrow" | "copy" | "spark" | "check") => {
  const shapes = {
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    spark:
      '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  };
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]}</svg>`;
};

export function layout(
  title: string,
  description: string,
  path: string,
  content: string,
  options: { noindex?: boolean; ga?: string } = {},
) {
  const canonical = origin + path;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="theme-color" content="#101126">
<title>${escapeHTML(title)}</title><meta name="description" content="${escapeHTML(description)}">
<link rel="canonical" href="${escapeHTML(canonical)}">
${options.noindex ? '<meta name="robots" content="noindex">' : ""}
<meta property="og:type" content="website"><meta property="og:site_name" content="MALSignature">
<meta property="og:title" content="${escapeHTML(title)}"><meta property="og:description" content="${escapeHTML(description)}">
<meta property="og:url" content="${escapeHTML(canonical)}"><meta property="og:image" content="${origin}/assets/social.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="analytics-id" content="${escapeHTML(options.ga || "")}">
<link rel="icon" href="/assets/favicon-16.png" type="image/png" sizes="16x16">
<link rel="icon" href="/assets/favicon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/assets/favicon-48.png" type="image/png" sizes="48x48">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" sizes="any">
<link rel="apple-touch-icon" href="/assets/favicon-180.png" sizes="180x180">
<link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/client.js"></script>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebApplication", name: "MALSignature", url: origin, applicationCategory: "MultimediaApplication", operatingSystem: "Any", description: "Create automatically updating MyAnimeList signature images.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }).replaceAll("<", "\\u003c")}</script>
</head><body>
<a class="skip-link" href="#main">Skip to content</a>
<div class="backdrop" aria-hidden="true"></div>
<header class="site-header">
  <a class="brand" href="/" aria-label="MALSignature home"><span class="brand-mark">${icon("spark")}</span><span>MAL<span class="brand-light">Signature</span></span></a>
   <nav aria-label="Main navigation"><span class="nav-indicator" aria-hidden="true"></span><a href="/" ${path === "/" || path === "/signature/" ? 'aria-current="page"' : ""}>Generator</a><a href="/ranking/" ${path.startsWith("/ranking") ? 'aria-current="page"' : ""}>Leaderboard</a></nav>
</header>
<main id="main" tabindex="-1">${content}</main>
<footer class="site-footer"><span>Made for the anime you love.</span><span>By <a href="https://monicz.dev/">Zaczero</a><span class="footer-dot" aria-hidden="true">·</span><a href="https://github.com/Zaczero/MALSignature">Source</a></span><small>Independent project. Not affiliated with MyAnimeList.</small></footer>
<div id="announcement" class="sr-only" role="status" aria-live="polite"></div>
</body></html>`;
}

export function home(ga = "") {
  return layout(
    "MALSignature — Your anime story, made to share",
    "Create your free, automatically updating MyAnimeList signature. Two classic styles, ready for your profile, website or forum.",
    "/",
    `
<section class="hero">
  <p class="eyebrow"><span class="status-dot" aria-hidden="true"></span> YOUR ANIME. YOUR SIGNATURE.</p>
  <h1>Your anime story.<br><span class="gradient-text">Made to share.</span></h1>
  <p class="hero-description">Turn your MyAnimeList profile into a signature<br class="desktop-break"> that keeps up with you.</p>
</section>
<section class="glass workbench" aria-labelledby="generator-heading">
  <div class="generator-content">
    <span class="section-label">LET’S MAKE IT YOURS</span>
    <h2 id="generator-heading">One username.<br> All your anime.</h2>
    <p>Your stats, avatar and recent anime,<br> in one little corner of the internet.</p>
    <form id="generate-form" action="/api/generate" method="post">
      <label for="username">MyAnimeList username</label>
      <input id="username" name="username" placeholder="e.g. Zaczer_o" autocomplete="off" autocapitalize="none" spellcheck="false" required maxlength="32" pattern="[A-Za-z0-9_-]+" aria-describedby="username-help form-error">
      <p id="username-help" class="field-help">Just your username. We’ll take care of the rest.</p>
      <button class="primary-button" type="submit"><span>Generate my signature</span>${icon("arrow")}</button>
      <p id="form-error" class="form-error" role="alert"></p>
    </form>
    <noscript><p>JavaScript is needed for the interactive preview. You can still submit the form and open the image links returned by the generator.</p></noscript>
  </div>
  <div class="preview-pane">
    <div class="preview-heading"><span>THE ORIGINAL LOOK</span><span class="preview-badge">Live stats. Timeless style.</span></div>
    <div class="signature-display"><img src="/assets/example-normal.webp" alt="Example normal signature for Zaczer_o, with profile picture, anime statistics and three recent anime" width="400" height="135" decoding="async"></div>
    <div class="preview-caption"><span class="mini-line" aria-hidden="true"></span> Normal · 400 × 135</div>
    <div class="signature-display compact-preview"><img src="/assets/example-small.webp" alt="Example compact signature with the same profile picture and statistics" width="400" height="63" decoding="async" loading="lazy"></div>
    <div class="preview-caption"><span class="mini-line" aria-hidden="true"></span> Compact · 400 × 63</div>
    <p class="preview-note">Two sizes. Same you.</p>
  </div>
</section>
<section class="features" aria-label="How it works">
  <div><span class="feature-number">01</span><h2>Make it personal</h2><p>Your profile picture, your stats,<br> your latest anime.</p></div>
  <div><span class="feature-number">02</span><h2>Copy. Paste. You’re in.</h2><p>Grab a link, BBCode or HTML.<br> At home on your favourite forum.</p></div>
  <div><span class="feature-number">03</span><h2>Let it keep up</h2><p>Active signatures refresh automatically.<br> No need to replace your link.</p></div>
</section>`,
    { ga },
  );
}

export function result(ga = "") {
  return layout(
    "Your signature — MALSignature",
    "Preview your MyAnimeList signature and copy its image URL, BBCode or HTML.",
    "/signature/",
    `
<section class="page-heading"><p class="eyebrow">READY WHEN YOU ARE</p><h1>Your little <span class="gradient-text">anime story.</span></h1><p id="result-description">Choose a style, copy your code, and make yourself at home.</p></section>
<section class="glass result-panel" aria-label="Your signature">
  <div class="result-top"><a href="/" class="text-link">← Create another</a><div class="style-switch" role="group" aria-label="Signature size"><button type="button" data-style="normal" aria-pressed="true">Normal</button><button type="button" data-style="small" aria-pressed="false">Compact</button></div></div>
  <div class="result-preview" id="result-preview"><p>Enter your username on the <a href="/">generator</a> to see your signature.</p></div>
  <p class="result-size" id="result-size"></p>
  <div class="embed-fields">
    ${[
      ["url", "Image URL"],
      ["bbcode", "BBCode", "For forums"],
      ["html", "HTML", "For websites"],
    ]
      .map(
        ([key, label, hint]) =>
          `<div class="embed-field"><label for="embed-${key}">${label}${hint ? `<span>${hint}</span>` : ""}</label><div class="copy-row"><input id="embed-${key}" readonly spellcheck="false" aria-label="${label}"><button type="button" class="copy-button" data-copy="${key}" aria-label="Copy ${label}">${icon("copy")}${icon("check")}<span>Copy</span></button></div></div>`,
      )
      .join("")}
  </div>
  <p class="result-note"><span class="status-dot" aria-hidden="true"></span> The image updates. Your link stays the same.</p>
</section>`,
    { noindex: true, ga },
  );
}

export function rankingPage(ranking: Ranking, page: number, ga = "") {
  const total = ranking.entries.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const path = page === 1 ? "/ranking/" : `/ranking/page/${page}/`;
  const url = (index: number) =>
    index === 1 ? "/ranking/" : `/ranking/page/${index}/`;
  const rows = ranking.entries.slice((page - 1) * pageSize, page * pageSize);
  const date = new Date(ranking.updatedAt);
  const dateLabel = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const links = [
    ...new Set([
      1,
      ...Array.from({ length: 5 }, (_, i) => page - 2 + i).filter(
        (n) => n >= 1 && n <= pages,
      ),
      pages,
    ]),
  ].sort((a, b) => a - b);
  let previous = 0;
  const navigation = links
    .map((number) => {
      const dots =
        previous && number > previous + 1
          ? '<span class="page-gap" aria-hidden="true">…</span>'
          : "";
      previous = number;
      return `${dots}<a href="${url(number)}" ${number > 1 ? 'rel="nofollow"' : ""} ${number === page ? 'aria-current="page"' : ""} aria-label="Page ${number}">${number}</a>`;
    })
    .join("");
  return layout(
    `Leaderboard${page > 1 ? ` · Page ${page}` : ""} — MALSignature`,
    `Explore the most popular MyAnimeList signatures. Browse ${total.toLocaleString("en")} signatures or find your place in the community.`,
    path,
    `
<section class="page-heading ranking-heading"><p class="eyebrow">A LITTLE FRIENDLY COMPETITION</p><h1>Popular <span class="gradient-text">signatures.</span></h1></section>
<section class="glass ranking-panel" aria-labelledby="ranking-heading">
  <div class="ranking-top"><div><h2 id="ranking-heading" class="sr-only">Most popular signatures</h2><p>${total.toLocaleString("en")} signatures · Updated <time datetime="${date.toISOString()}">${dateLabel}</time></p></div>
  <form id="search-form" role="search"><label class="sr-only" for="ranking-search">Find a MyAnimeList username in the ranking</label><input id="ranking-search" name="q" placeholder="Find your username" autocomplete="off" autocapitalize="none" spellcheck="false"><button class="secondary-button" type="submit">Find ${icon("arrow")}</button></form></div>
  <p class="search-message" id="search-message" role="status"></p>
  <div class="table-scroll"><table><caption class="sr-only">Most popular signatures over the last 30 days, page ${page} of ${pages}.</caption><thead><tr><th scope="col">Rank</th><th scope="col">MyAnimeList user</th><th scope="col" class="numeric">Popularity</th></tr></thead><tbody>
  ${
    rows.length
      ? rows
          .map(([username, popularity], i) => {
            const rank = (page - 1) * pageSize + i + 1;
            return `<tr id="user-${escapeHTML(username.toLowerCase())}"><td><span class="rank ${rank <= 3 ? `rank-${rank}` : ""}">${String(rank).padStart(2, "0")}</span></td><th scope="row"><a href="https://myanimelist.net/profile/${encodeURIComponent(username)}">${escapeHTML(username)}</a></th><td class="numeric"><span class="popularity-score">${popularity.toFixed(1)}</span><span class="popularity-bar" aria-hidden="true"><span style="width:${popularity}%"></span></span></td></tr>`;
          })
          .join("")
      : '<tr><td colspan="3">The first ranking snapshot is on its way.</td></tr>'
  }
  </tbody></table></div>
  <div class="ranking-bottom"><p>Last 30 days · Updated daily.</p><nav class="pagination" aria-label="Leaderboard pages">${page > 1 ? `<a href="${url(page - 1)}" ${page > 2 ? 'rel="nofollow"' : ""} aria-label="Previous page">←</a>` : ""}${navigation}${page < pages ? `<a href="${url(page + 1)}" rel="nofollow" aria-label="Next page">→</a>` : ""}</nav></div>
</section>`,
    { ga, noindex: page > 1 },
  );
}

export function notFound() {
  return layout(
    "Page not found — MALSignature",
    "This page could not be found.",
    "/404/",
    `<section class="glass empty-state"><p class="eyebrow">404 · LOST IN THE NEXT EPISODE</p><h1>This page isn’t here.</h1><p>Your next signature is only a click away.</p><a class="primary-button" href="/">Back to the generator ${icon("arrow")}</a></section>`,
    { noindex: true },
  );
}
