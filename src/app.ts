import { join, resolve, sep } from "node:path";
import * as Sentry from "@sentry/bun";
import { ProfileError } from "./profile";
import { imageRoute } from "./routes";
import type { Signatures } from "./signatures";
import { staticResponseHeaders } from "./static";

export function createHandler(
  signatures: Signatures,
  directory: string,
  publicOrigin?: string,
) {
  const root = resolve(directory);
  const expectedOrigin = publicOrigin ? new URL(publicOrigin).origin : null;
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    try {
      const image = imageRoute(url);
      if (image) {
        if (!["GET", "HEAD"].includes(request.method))
          return new Response(null, {
            status: 405,
            headers: { Allow: "GET, HEAD" },
          });
        return await signatures.view(image.username, image.style, request);
      }
      if (url.pathname === "/api/generate") {
        if (request.method !== "POST")
          return new Response(null, {
            status: 405,
            headers: { Allow: "POST" },
          });
        const from = request.headers.get("Origin");
        if (from && from !== (expectedOrigin || url.origin))
          return Response.json(
            { error: "Please submit the form from this site." },
            { status: 403, headers: { "Cache-Control": "no-store" } },
          );
        const json = request.headers
          .get("Content-Type")
          ?.includes("application/json");
        let username: unknown;
        try {
          username = json
            ? (await request.json()).username
            : (await request.formData()).get("username");
        } catch {
          throw new ProfileError("Please enter a username.", 400);
        }
        if (typeof username !== "string")
          throw new ProfileError("Please enter a username.", 400);
        const signature = await Sentry.startSpan(
          { op: "signature.generate", name: "Generate signature" },
          () => signatures.generate(username),
        );
        if (json)
          return Response.json(
            { username: signature.username },
            { headers: { "Cache-Control": "no-store" } },
          );
        const encoded = encodeURIComponent(signature.username);
        return new Response(
          `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Your signature</title><h1>Your signature is ready</h1><p><a href="/signature/?username=${encoded}">Open the preview</a></p><p><a href="/?/view?username=${encoded}&amp;style=normal">Normal PNG</a> · <a href="/?/view?username=${encoded}&amp;style=small">Compact PNG</a></p></html>`,
          {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        );
      }
      if (!["GET", "HEAD"].includes(request.method))
        return new Response(null, { status: 405 });
      const legacyPage =
        url.pathname === "/" &&
        /^\/?(ranking|success)(?:[?&]|$)/.exec(url.search.slice(1));
      if (legacyPage) {
        return Response.redirect(
          new URL(
            legacyPage[1] === "ranking" ? "/ranking/" : "/signature/",
            url,
          ),
          301,
        );
      }
      let pathname: string;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        throw new ProfileError("Invalid URL.", 400);
      }
      let path = resolve(root, `.${pathname}`);
      if (path !== root && !path.startsWith(root + sep))
        throw new ProfileError("Not found.", 404);
      if (pathname.endsWith("/")) path = join(path, "index.html");
      const file = Bun.file(path);
      const exists =
        !pathname.endsWith(".map") &&
        !["/_headers", "/_redirects"].includes(pathname) &&
        (await file.exists()) &&
        (await file.stat()).isFile();
      const content = exists ? file : Bun.file(join(root, "404.html"));
      return new Response(request.method === "HEAD" ? null : content, {
        status: exists ? 200 : 404,
        headers: {
          ...staticResponseHeaders(pathname),
          "Content-Type": exists ? file.type : "text/html; charset=utf-8",
          ...(!exists ? { "Cache-Control": "no-store" } : {}),
        },
      });
    } catch (error) {
      if (error instanceof ProfileError) {
        return Response.json(
          { error: error.message },
          {
            status: error.status,
            headers: {
              "Cache-Control": "no-store",
              ...(error.retryAfter > 0
                ? { "Retry-After": String(error.retryAfter) }
                : {}),
            },
          },
        );
      }
      Sentry.captureException(error);
      console.error(error);
      return Response.json(
        { error: "We couldn’t finish that request. Please try again shortly." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
