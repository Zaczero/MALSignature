const immutable = { "Cache-Control": "public, max-age=86400, immutable" };

export const staticHeaderRules: Record<`${string}*`, Record<string, string>> = {
  "/*": {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  },
  "/assets/client-*": immutable,
  "/assets/site-*": immutable,
  "/assets/chunk-*": immutable,
  "/signature/*": { "X-Robots-Tag": "noindex" },
  "/ranking/page/*": { "X-Robots-Tag": "noindex" },
  "/ranking/search/*": { "X-Robots-Tag": "noindex" },
};

export function staticResponseHeaders(pathname: string) {
  const headers: Record<string, string> = {
    "Cache-Control": "public, max-age=0, must-revalidate",
  };
  for (const [pattern, values] of Object.entries(staticHeaderRules)) {
    if (pathname.startsWith(pattern.slice(0, -1)))
      Object.assign(headers, values);
  }
  return headers;
}
