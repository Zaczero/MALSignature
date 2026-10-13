# Hosting MALSignature

The static website lives in Cloudflare Workers Static Assets. A Bun service on
the VPS owns MyAnimeList requests, SQLite, and generated PNGs on local disk.
Both are served at `malsignature.com`. Keep the apex DNS records proxied and
pointing at the VPS; use the Worker **Route** in `wrangler.jsonc`, not a Worker
Custom Domain.

## Local development

Enter `nix-shell`, which installs the locked dependencies. Bun runs the application
and build; Wrangler uses the shell's Node.js solely as its CLI runtime. Do not
force Wrangler under Bun: its local proxy can hang without returning responses.

- `bun run dev` builds and serves the complete local application on port 3000.
- `bun run preview:static` builds and serves the Cloudflare asset-only runtime
  on port 3001. It exercises HTML handling, static headers and 404s. It does not
  emulate zone-level rewrites or route exclusions; image generation belongs to
  the complete application on port 3000.
- `bun test`, `tsc --noEmit`, and
  `biome check --write src web scripts tests cloudflare wrangler.jsonc` are the
  local checks.
- `bun run wrangler deploy --dry-run` validates the deployment locally
  after a build. It does not validate the account's zone rules.

`bun run build` produces `dist`, including `_headers`, and keeps source maps in
`.build/sourcemaps` outside the public directory. The frontend deployment has
no Worker script and no database or storage bindings.

Generated assets use content-derived filenames and are cached for one year
with `immutable`. Leaderboard search indexes use a content-versioned directory
with the same policy. HTML and the sitemap are fresh for five minutes.
The build retains the preceding day's assets and search indexes for cached
pages and open tabs.

## VPS service

Deploy the Git checkout using the fleet's project-shell/systemd mechanism.
Run `bun run start` from the checkout inside its Nix shell. Set `STATE_DIRECTORY`
to a persistent writable directory; SQLite, source-image cache and PNG files
live beneath it. `PUBLIC_DIRECTORY` defaults to the built `dist` directory,
which also supports local preview and rollback to origin-served pages.

Use strict origin TLS and the fleet's origin-access controls. Preserve the
incoming apex hostname so same-origin form submissions continue to work.
Set `SENTRY_ENVIRONMENT=production` and the release identifier at deployment.
Back up SQLite consistently. PNGs and `.data/cache` can be regenerated;
retaining PNGs in backups also preserves last-good images for deleted profiles.

Run `bun run prune` daily. It removes images after 30 days without an origin
access while retaining accounts and totals. Images served by the CDN do not
update SQLite, so use the origin's short image cache lifetime, not an
indefinitely cached image policy. Signature responses cache for the remaining
portion of their one-hour refresh window, with a one-minute minimum, 24 hours
of stale-while-revalidate and seven days of stale-if-error. Existing images are
returned immediately while origin refreshes run in the background. This keeps origin access recent
enough for inactivity pruning while avoiding per-request revalidation.

The fleet checkout lives at `/home/malsignature`. Update it with `git pull
--ff-only`, restart `malsignature.service`, then start
`malsignature-publish.service`. The service builds the origin's static fallback;
the publication job builds and uploads the Cloudflare assets and private Sentry
source maps. Both use the checkout's commit as `SENTRY_RELEASE`.

The production build uses Google Analytics measurement ID `G-YM45LLEL4R`.
Localhost does not load Analytics. Sentry's `malsignature` project is connected
to `Zaczero/MALSignature`; the publication job associates each release with its
Git commit and records its production deployment.

## Initial Cloudflare routing

Provision the following before attaching the catch-all static route:

1. Add each entry in `cloudflare/routes.json` as a zone Worker route **without
   an associated Worker**. These exclusions send `/index.php*`, `/view.php*`
   and `/api/*` to the existing origin.
2. Add the rules in `cloudflare/rules.json` to the corresponding zone entrypoint
   phases. Each value is an array of Rulesets API rule objects; it is not a
   replacement entrypoint ruleset. Reconcile by `ref` and preserve unrelated
   rules. Inspect existing rules and Page Rules for overlapping behavior.
3. Retain the complete query string in image cache keys. Do not enable Ignore
   Query String or query-string sorting for these URLs: names, styles and
   duplicate-parameter ordering affect the response.
4. The generation rate rule limits `/api/generate` to ten requests per ten
   seconds per source address at each Cloudflare location, without a challenge.
   The application's admission limits remain 20 new profiles/minute,
   60 refreshes/minute and four concurrent jobs. Image delivery must remain
   challenge-free.

The rewrite changes only the internal path:

```text
/?/view?username=Some_User&amp;style=small
    → /index.php?/view?username=Some_User&amp;style=small
```

It preserves the query and issues no redirect. URL rewrites execute before
Worker route selection, so the rewritten path takes the no-Worker exclusion.
The Bun parser already supports that path. Direct `/view.php` and `/index.php`
links use exclusions without a rewrite. Separate Redirect Rules preserve old
leaderboard and success-page navigation.

The image Cache Rule respects origin cache headers, including `no-store` on
errors. The API rule disables caching. These rules use Free-plan operators;
their availability does not validate remaining rule quota in a particular
account.

## Static releases and ranking updates

Use Wrangler's native Cloudflare authentication (`wrangler login` interactively
or `CLOUDFLARE_API_TOKEN` for automation, with `CLOUDFLARE_ACCOUNT_ID` when account
selection is needed). The release credential needs Workers Scripts edit and
Workers Routes edit for this zone. Initial zone-rule provisioning additionally
needs permission to edit its relevant Rulesets phases.

From the VPS checkout, after the backend release and ranking snapshot are
ready, run `bun run deploy:static`. This builds against the local SQLite state
and publishes the complete asset deployment, including the `malsignature.com/*`
route. It is a production operation. Schedule the same command after the daily
ranking snapshot so the static leaderboard follows the database.

Set `GOOGLE_ANALYTICS_ID` and `SENTRY_RELEASE` at build time as appropriate.
Upload `.build/sourcemaps` with the authenticated Sentry CLI for that release.
Never upload the state directory or source maps as static assets.

Before cutover, validate on an isolated hostname when authorized. Confirm:

- Homepage, direct leaderboard pages, CSS, JavaScript and 404s never reach the
  VPS, including cold requests.
- Root-query, `/index.php` and `/view.php` embeds return PNGs directly, including
  encoded usernames and `amp;` forms.
- Different users/styles never share cached image responses.
- JSON and native form submissions reach the VPS, and errors are not cached.
- Direct links, browser back/forward, reduced motion and keyboard focus work.

No local emulator proves zone routing, account permissions, cache behavior or
billing counters. Verify those on the actual edge before accepting deployment.

## Rollback

Keep the previous backend checkout, consistent SQLite backup and previous
Cloudflare asset version through acceptance. To return website serving to the
VPS, remove the catch-all Worker route while retaining origin DNS. The rewrite
can stay: the backend supports both original and rewritten image URLs.
The built `dist` directory on the VPS serves the website.

## Cloudflare references

- [Worker routes and exclusions](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [URL rewrite execution order](https://blog.cloudflare.com/introducing-transform-rules-with-url-rewriting-at-the-edge/)
- [Static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Cache Rule settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)
