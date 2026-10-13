import * as Sentry from "@sentry/browser";
import { sentryOptions } from "../src/telemetry";

Sentry.init({
  ...sentryOptions,
  environment:
    location.hostname === "malsignature.com" ? "production" : "development",
  release:
    document.querySelector<HTMLMetaElement>('meta[name="release"]')?.content ||
    undefined,
});

export function reportError(error: unknown) {
  Sentry.captureException(error);
}
