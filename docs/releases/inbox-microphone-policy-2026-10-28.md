# WhatsApp inbox voice capture permissions

Native voice recording requires both a browser permission grant and a response policy that permits microphone capture. A global `microphone=()` policy prevents recording before the browser can grant that permission.

The protected `/dashboard/communication/inbox` section now receives a later Next header rule with `microphone=(self)`. Other pages and API paths retain the microphone prohibition. Camera and location remain prohibited, and the other existing security headers still apply.

Verification runs the real Next config through the installed Next routing test utility for ten paths, including trailing paths and a lookalike route. A native Chromium fixture receives those headers: microphone capture is blocked on a public page and produces a nonempty recording in the inbox after a click. The recorder stops its audio tracks afterwards.

App Router navigation does not update the document permission policy. A boundary at the root layout therefore uses document navigation when links enter or leave the inbox, with an automatic reload fallback for programmatic/history transitions. It stays mounted when leaving the dashboard for a public page. Navigation within the inbox remains client-side. Browser checks cover both directions, actual recording after entry, returning to a public page, and preserving query strings and fragments.

The suite has 20 checks and uses a synthetic microphone. It does not require application data, message providers or real recipients. Existing composer and media suites cover attachment submission, native recording controls and playback.

The config test utility does not execute authentication or the full Next proxy; existing dashboard access guards remain responsible for authentication. As with other Next config changes, rebuilding and restarting the application activates the new response header.
