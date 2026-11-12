#!/usr/bin/env node
// Production build remains unchanged except for this fail-closed protection:
// never execute its built-in index migration from a staging runtime.
if (process.env.MINBER_RUNTIME_ROLE === "staging" ||
    process.env.STAGING_BUILD_APPROVED === "1") {
  console.error("PRODUCTION_BUILD_DENIED_IN_STAGING: use npm run build:staging");
  process.exitCode = 1;
} else {
  console.log("BUILD_MODE=PRODUCTION_OR_CI");
}
