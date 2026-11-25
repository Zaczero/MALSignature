import { initSentry } from "./sentry";
import { sentryOptions } from "./telemetry";

initSentry({
  dsn: process.env.SENTRY_DSN || sentryOptions.dsn,
  environment: process.env.SENTRY_ENVIRONMENT || "development",
  release: process.env.SENTRY_RELEASE,
});
