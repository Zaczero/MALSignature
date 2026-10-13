const immutable = { "Cache-Control": "public, max-age=31536000, immutable" };
const pages = { "Cache-Control": "public, max-age=300" };

export const staticHeaderRules: Record<string, Record<string, string>> = {
  "/*": {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  },
  "/": pages,
  "/index.html": pages,
  "/ranking/": pages,
  "/ranking/index.html": pages,
  "/robots.txt": pages,
  "/sitemap.xml": pages,
  "/assets/*": immutable,
  "/signature/*": { ...pages, "X-Robots-Tag": "noindex" },
  "/ranking/page/*": { ...pages, "X-Robots-Tag": "noindex" },
  "/ranking/search/*": { ...immutable, "X-Robots-Tag": "noindex" },
};

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
  return headers;
}
