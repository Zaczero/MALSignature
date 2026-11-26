const immutable = { "Cache-Control": "public, max-age=31536000, immutable" };
const pages = {
  "Cache-Control":
    "public, max-age=300, stale-while-revalidate=86400, stale-if-error=86400",
};
const laterRankingPages = {
  "Cache-Control":
    "public, max-age=1800, stale-while-revalidate=86400, stale-if-error=86400",
};
const faviconIco = {
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
};
const rootNoVarySearch =
  'params=("utm_source" "utm_medium" "utm_campaign" "utm_content" "utm_term" "fbclid" "gclid")';

export const staticHeaderRules: Record<string, Record<string, string>> = {
  "/*": {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Frame-Options": "SAMEORIGIN",
  },
  "/": { ...pages, "No-Vary-Search": rootNoVarySearch },
  "/index.html": { ...pages, "No-Vary-Search": rootNoVarySearch },
  "/ranking/": { ...pages, "No-Vary-Search": "params" },
  "/ranking/index.html": { ...pages, "No-Vary-Search": "params" },
  "/robots.txt": pages,
  "/sitemap.xml": pages,
  "/favicon.ico": faviconIco,
  "/signature/*": {
    ...pages,
    "No-Vary-Search": "params",
    "X-Robots-Tag": "noindex",
  },
  "/ranking/page/*": {
    ...laterRankingPages,
    "No-Vary-Search": "params",
    "X-Robots-Tag": "noindex",
  },
  "/ranking/search/*": { ...immutable, "X-Robots-Tag": "noindex" },
};

export function renderHeadersFile(assetFiles: readonly string[]): string {
  const rules: [string, Record<string, string>][] = [
    ...Object.entries(staticHeaderRules),
    ...[...assetFiles]
      .sort()
      .map((file): [string, Record<string, string>] => [
        `/assets/${file}`,
        immutable,
      ]),
  ];
  return `${rules
    .map(([pattern, headers]) =>
      [
        pattern,
        ...Object.entries(headers).map(([key, value]) => `  ${key}: ${value}`),
      ].join("\n"),
    )
    .join("\n\n")}\n`;
}

export function staticResponseHeaders(pathname: string) {
  const headers: Record<string, string> = {
    ...pages,
  };
  for (const [pattern, values] of Object.entries(staticHeaderRules)) {
    if (
      pattern.endsWith("*")
        ? pathname.startsWith(pattern.slice(0, -1))
        : pathname === pattern
    )
      Object.assign(headers, values);
  }
  if (pathname.startsWith("/assets/")) Object.assign(headers, immutable);
  return headers;
}
