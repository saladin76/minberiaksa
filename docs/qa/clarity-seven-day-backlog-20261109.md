# Clarity investigation backlog — Minberi Aksa

This backlog is issue-ready follow-up work, not a list of observed defects. The
current seven-day investigation is **DATA_ACCESS_BLOCKED**; no item below
asserts a live failure. Do not change production analytics, ads, payment flows,
or tracking settings without authorized evidence and review.

## P0 — Unblock evidence collection

**Provide authorized project access or a redacted seven-day export**

- Confirm the institution and current live Clarity project ID independently
  from the authorized team/deployment; do not assume the source fallback is
  current.
- Supply an export bounded to `[2026-11-02T17:09:24.600Z,
  2026-11-09T17:09:24.600Z)` and report its timezone, row count, and whether it
  is an index, event export, or actual replay review.
- Acceptance: project identity, source coverage, and review denominator are
  recorded without credentials, recording links, or raw user identifiers.

## P1 — Review donation journey and failures

**Systematically inspect available high-impact checkout replays**

- Prioritize paid-campaign landing evidence; Zakat/Gaza/Jerusalem amount
  selection; cart support-team add-on and currency; OTP; saved cards; Albaraka
  2D/3D; PayFor; PayPal; recurring daily/Friday/monthly; redirects, failures,
  and confirmation.
- Stratify by available day, landing/exit route, device/browser/OS, locale,
  and actual evidence for acquisition classification. Report the full available
  denominator and every sample selection rule.
- Acceptance: only reproduced or directly observed failures become findings;
  record normalized route, Istanbul day/hour, environment, event/time offset,
  anonymized review key, sample denominator, impact, severity, and a cause
  clearly marked as a hypothesis until reproduced.

**Separate route telemetry from successful settlement**

- Compare cart/checkout/provider-return/confirmation observations with
  permissioned aggregate settled and failed transaction counts, if approved.
- Acceptance: success-page visits are not labeled paid donations; one-time,
  recurring, pending, failed, and redirect flows are distinguished.

## P1 — Verify analytics taxonomy and duplication

**Inventory Clarity Smart Events and GA4/GTM conversion mappings**

- Compare definitions against `measurement_version=2`, inspect duplicate GTM
  installations and conversion triggers, and distinguish native Rage clicks
  from `rapid_pointer_burst`.
- Acceptance: document actual definitions and match only confirmed donations
  to Purchase/Donate; no test or engagement event is promoted to a conversion.

## P2 — Complete recording and performance review

**Audit filters, masking, and behavioral/performance evidence**

- Inspect available dashboard filters, heatmaps, scroll/click clusters, form
  validation, dead clicks, quick backs, excessive scroll, blank screens, JS
  errors, visibility, and page performance (LCP/INP/CLS).
- Verify allowed session-tracking hosts and sensitive-field masking in the
  current live project.
- Acceptance: distinguish telemetry artifacts and false positives from
  reproduced site defects; keep raw session URLs and donor information out of
  the report.
