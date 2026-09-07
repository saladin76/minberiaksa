# Netgsm — Turkey SMS Integration

Netgsm sends SMS to **Turkish numbers only**. Server-only: usercode/password read inside the adapter,
never surfaced. No Twilio fallback; non-Turkish numbers are rejected here (they route to Brevo).

## Required env vars
| Var | Purpose | Required |
|---|---|---|
| `NETGSM_USERCODE` | Netgsm account usercode | ✅ |
| `NETGSM_PASSWORD` | Netgsm account password | ✅ |
| `NETGSM_HEADER` | approved sender header (msgheader) | ✅ |
| `NETGSM_SMS_ENDPOINT` | override send endpoint | optional |
| `NETGSM_STATUS_ENDPOINT` | status/DLR endpoint (not implemented) | optional |

Readiness: `getNetgsmSmsConfig()` in `lib/communication/provider-env.ts`.

## Turkish number routing
`isTurkishNumber(phone, countryCode)` (`providers/netgsm/types.ts`) → true when:
- `countryCode === "TR"`, or
- phone starts with `+90` / `0090`, or
- normalized digits start with `90` and are 12 long.
The SMS router (`providers/sms/client.ts`) sends TR → Netgsm, everything else → Brevo.

## Send flow
`lib/communication/providers/netgsm/client.ts` → `sendNetgsmSms()`
- `POST https://api.netgsm.com.tr/sms/rest/v2/send` (override via `NETGSM_SMS_ENDPOINT`),
  `Authorization: Basic base64(usercode:password)`.
- Body: `{ msgheader: NETGSM_HEADER, encoding: "TR", messages: [{ msg, no }] }`.
- **Conservative parsing**: success is code `"00"` (jobid = `providerMessageId`; if no jobid →
  `internalAccepted`). Any other code → `NETGSM_REJECTED`. Non-`00`/unparseable body →
  `NETGSM_INVALID_RESPONSE` (never a fake SENT). Reasons: `NETGSM_NOT_CONFIGURED`,
  `NETGSM_REQUEST_FAILED`, `NETGSM_REJECTED`, `NETGSM_RECIPIENT_NOT_TURKISH`, `NETGSM_INVALID_RESPONSE`.

## Status limitations
- Delivery-status callbacks (DLR) are **not implemented**. Netgsm status is available via a separate
  polling endpoint (`NETGSM_STATUS_ENDPOINT`) — a delivery stays SENT unless manually reconciled.
- Exact response format / error codes vary by account type → **must be confirmed with live QA**.

## Live QA checklist (needs a real Turkish test number)
- [ ] Send test SMS to a `+90…` number → provider shows **Netgsm**, returns SENT with a jobid.
- [ ] Confirm the real Netgsm response shape matches `code "00" + jobid`; adjust parsing if different.
- [ ] Missing `NETGSM_USERCODE`/`PASSWORD`/`HEADER` → SKIPPED `NETGSM_NOT_CONFIGURED` (never SENT).
- [ ] A non-Turkish number is NOT sent via Netgsm (routes to Brevo instead).
- [ ] Turkish characters render correctly (encoding `TR`).
