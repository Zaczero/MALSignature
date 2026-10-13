import * as Sentry from "@sentry/bun";
import { sentryOptions } from "./telemetry";

Sentry.init({
  ...sentryOptions,
  tracesSampleRate: 0.1,
  dsn: process.env.SENTRY_DSN || sentryOptions.dsn,
  environment: process.env.SENTRY_ENVIRONMENT || "development",
});
