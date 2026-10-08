/**
 * The only module that imports @sentry/react. Loaded lazily by ./sentry.js; named imports keep
 * the chunk tree-shaken (no Replay / Feedback / tracing code).
 */
export {
  init,
  captureException,
  captureReactException,
  breadcrumbsIntegration,
} from "@sentry/react";
export { isNativeIOS } from "./platform";
