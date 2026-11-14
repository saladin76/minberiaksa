# Minberi Aksa Clarity seven-day investigation — 9 November 2026

## Status: DATA_ACCESS_BLOCKED

This is a source-level audit and an evidence collection template, not a live
Clarity findings report. The authorized browser could not resolve either
`https://minberiaksa.org` or `https://clarity.microsoft.com`. No approved,
redacted Clarity export was available in the repository. No dashboard, session,
replay, Events timeline, heatmap, live deployment, GTM container, or settlement
data was accessible. Therefore there are **no observed session failures or
donation-funnel findings** in this report.

Do not interpret the missing evidence as zero failures, and do not cite
`/home/runner/work/minberiaksa/minberiaksa/docs/qa/clarity-measurement-20261025.md`
or its exports as observations from this target week.

## Required window

Execution time supplied for this investigation: **2026-11-09 17:09:24.600 UTC**
(**2026-11-09 20:09:24.600 Europe/Istanbul**, UTC+03:00).

| Boundary | UTC | Europe/Istanbul |
| --- | --- | --- |
| Inclusive start (rolling 7 days) | 2026-11-02 17:09:24.600Z | 2026-11-02 20:09:24.600 +03:00 |
| Exclusive end | 2026-11-09 17:09:24.600Z | 2026-11-09 20:09:24.600 +03:00 |

Use the half-open interval `[start, end)` for exact timestamp filtering. The
corresponding Istanbul calendar dates are November 2 through November 9; the
end date is partial. A date-only export cannot establish full rolling-window
coverage and must be described as date-filtered rather than exact-window data.

## Institution, project, and deployment verification

- Institution/domain in the issue: Minberi Aksa / `minberiaksa.org`.
- Live domain verification: **blocked** (browser DNS resolution failed).
- Live Clarity team/project access: **blocked** (dashboard host could not be
  reached; no authorized team session was available).
- Live deployment project ID: **unverified**. The checked-out source defaults to
  `u60r8zhrzh` in `/home/runner/work/minberiaksa/minberiaksa/lib/tracking/clarity-config.ts`
  and allows `NEXT_PUBLIC_CLARITY_ID` to override it. A source default, including
  the historical October 25 observation recorded in the older QA report, does
  not verify the ID used by the deployment during this target week.
- Approved redacted export present: **no**.

Never put project credentials, access tokens, cookies, donor data, raw session
IDs, or recording URLs into this report or a pull request.

## Coverage and observed failures

| Source / denominator | Available | Reviewed in this investigation |
| --- | ---: | ---: |
| Dashboard overview and filtered session totals | No | 0 |
| Recording-index rows | No export | 0 |
| Replay videos and their Events timelines | No access | 0 |
| Custom/Smart Event definitions | No access | 0 |
| Heatmaps / scroll and click clusters | No access | 0 |
| Permissioned settled-donation aggregates | No access | 0 |

**Observed failure list:** none assessable. This means no observations were
available, not that no failures occurred. Impacted sessions and sample
denominators are unavailable; no P0/P1/P2 defect severity, user impact, or
probable cause can be assigned from this evidence.

The issue's listed checkout risks—amount choice, support add-on/currency,
OTP, saved cards, Albaraka 2D/3D, PayFor, PayPal, recurring schedules, redirects,
failed donations, confirmation/settlement, and Purchase/Donate duplication—are
review priorities only. They are **not findings** from this window. The
reported 27,000 TRY duplicate support amount, slow donate button, and session
drop-offs also remain unverified.

## Read-only source audit

This describes the checked-out source only; it does not prove the same version
was deployed for every session in the target period.

| Area | Source-level behavior | What this cannot establish |
| --- | --- | --- |
| Project and host guard | `/home/runner/work/minberiaksa/minberiaksa/components/MicrosoftClarity.tsx` initializes once per page in production on exact allowed hosts. `/home/runner/work/minberiaksa/minberiaksa/lib/tracking/engagement-policy.ts` defaults to `minberiaksa.org` and `www.minberiaksa.org`; an explicit allowlist replaces the defaults. | The live build's environment variables, runtime tag, or other independently installed tags. |
| Measurement taxonomy | `ENGAGEMENT_MEASUREMENT_VERSION` is `2`. Campaign values are sanitized; paid classification uses a paid medium or qualifying ad click ID, and click-ID values are not copied into engagement data. | Actual acquisition channel or paid status of any visit. A tag/UTM alone is not evidence that a visit was paid. |
| Route and privacy handling | Custom measurement removes private path identifiers and non-public query fields; `measurementRouteKey` ignores currency and credential parameters. Several checkout/payment UI regions carry Clarity masking attributes. | The effective masking configuration in the live recorder, full-site masking coverage, or the absence of sensitive data in any replay. |
| Custom engagement events | `/home/runner/work/minberiaksa/minberiaksa/components/EngagementInstrumentation.tsx` emits `rapid_pointer_burst` for nearby repeated pointer presses; its comment explicitly distinguishes it from Clarity's built-in Rage clicks. It also emits first-click/scroll, route, visibility, outbound-link, and donation-stage observations. | That a click was broken, a user was frustrated, a form failed, or a donation settled. |
| Donation stages | Cart, checkout, pending, success, and failure route views are sent as Clarity stage events. A success-page view is not proof of settlement. | Provider return, payment authorization/capture, or a confirmed donation. |
| Analytics fan-out | `trackEngagement` forwards sanitized diagnostics to Clarity and GA4, and normally to the GTM data layer; the GTM leg is blocked on `/success` and `/donation-failed` route segments. Donation-stage route events use Clarity directly. | Whether GTM maps these names to Purchase/Donate, whether additional tags duplicate conversions, or whether server-side events deduplicate correctly. |

The source does not supply dashboard-only Smart Event definitions, replay
timelines, LCP/INP/CLS traces, country/campaign filters, bot/human classification,
settled donation denominators, or current GTM configuration. These cannot be
reconstructed from source inspection.

## Reusable local CSV inventory

The offline importer is
`/home/runner/work/minberiaksa/minberiaksa/scripts/clarity-export-inventory.mjs`.
It makes no network or provider calls, requires explicit UTC boundaries, emits
no input URLs/session identifiers, redacts private route IDs, and creates
per-run review keys that cannot be joined across separate runs. An export that
contains recording links but no event column is marked `recording_index`; its
rows do not count as replay reviews. Keep generated output local and do not
commit it.

Example (replace the local path and boundaries with the approved export/window):

```sh
node /home/runner/work/minberiaksa/minberiaksa/scripts/clarity-export-inventory.mjs \
  --input /path/to/approved-redacted-export.csv \
  --from-utc 2026-11-02T17:09:24.600Z \
  --to-utc 2026-11-09T17:09:24.600Z \
  --timezone Europe/Istanbul
```

The tool's event timeline is a sanitized CSV inventory, not replay evidence. A
reviewer must inspect each authorized replay and its More details → Events,
navigation, and performance timeline before recording a behavioral finding.

## Issue-ready prioritized backlog

See `/home/runner/work/minberiaksa/minberiaksa/docs/qa/clarity-seven-day-backlog-20261109.md`.

## Evidence needed to resume

1. Approved read-only access to the Minberi Aksa Clarity team, or a
   redacted export covering the exact UTC interval, with the live project ID
   independently verified from the authorized project/deployment.
2. Recording index and event/timeline export, with row counts and clear
   distinction between indexed, available, and actually reviewed recordings.
3. Permissioned aggregate settlement counts only, if funnel conversion rates are
   requested; no donor-level records.
4. Current GTM/Smart Event definitions and consent/masking configuration, shared
   without credentials or donor/session identifiers.
