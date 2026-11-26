import { join, resolve, sep } from "node:path";
import { ProfileError } from "./profile";
import { imageRoute } from "./routes";
import { captureException } from "./sentry";
import type { Signatures } from "./signatures";
import { staticResponseHeaders } from "./static";

function permanentRedirect(location: URL): Response {
  return new Response(null, {
    status: 301,
    headers: {
      Location: location.href,
      "Cache-Control": "public, max-age=86400",
    },
  });
}

const fallbackNotFoundHtml =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Page not found — MALSignature</title><h1>Not found</h1></html>';

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
            headers: {
              Allow: "GET, HEAD",
              "Cache-Control": "no-store",
            },
          });
        return await signatures.view(image.username, image.style, request);
      }
      if (url.pathname === "/api/generate") {
        if (request.method !== "POST")
          return new Response(null, {
            status: 405,
            headers: {
              Allow: "POST",
              "Cache-Control": "no-store",
            },
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
        const signature = await signatures.generate(username);
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
        return new Response(null, {
          status: 405,
          headers: {
            Allow: "GET, HEAD",
            "Cache-Control": "no-store",
          },
        });
      if (url.pathname === "/index.php" && !url.search) {
        return permanentRedirect(new URL("/", url));
      }
      const legacyPage =
        url.pathname === "/" &&
        /^\/?(ranking|success)(?:[?&]|$)/.exec(url.search.slice(1));
      if (legacyPage) {
        return permanentRedirect(
          new URL(
            legacyPage[1] === "ranking" ? "/ranking/" : "/signature/",
            url,
          ),
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
      if (exists) {
        return new Response(request.method === "HEAD" ? null : file, {
          status: 200,
          headers: {
            ...staticResponseHeaders(pathname),
            "Content-Type": file.type,
          },
        });
      }
      const notFoundFile = Bun.file(join(root, "404.html"));
      const hasNotFoundPage =
        (await notFoundFile.exists()) && (await notFoundFile.stat()).isFile();
      return new Response(
        request.method === "HEAD"
          ? null
          : hasNotFoundPage
            ? notFoundFile
            : fallbackNotFoundHtml,
        {
          status: 404,
          headers: {
            ...staticResponseHeaders(pathname),
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
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
      captureException(error);
      console.error(error);
      return Response.json(
        { error: "We couldn’t finish that request. Please try again shortly." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
