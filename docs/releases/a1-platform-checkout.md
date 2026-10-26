# A1 editorial, dashboard and checkout changes

Scope: the A1 review and the approved compact Albaraka payment-mode selector. The existing card/contact form stays in place. This is a source release; local fixtures do not establish production deployment or live bank acceptance.

## Payment behavior

- One-time Albaraka card checkout requires an explicit choice: direct 2D first, or bank verification 3D. Neither is selected initially. Other gateways have no selector.
- Every recurring checkout hides the selector and the server forces 2D, even if a client requests 3D. Existing clients which omit a mode retain their previous 2D behavior.
- 2D uses the existing terminal, amount conversion, Sale, response validation, and settlement. 3D uses the existing base Albaraka terminal and original signed 3D form contract; it calls Sale only after a valid, linked, fully verified bank callback.
- Callback signature, merchant, order, amount and currency must agree before any write. An atomic capture claim prevents replay or concurrent callbacks from starting another Sale. Authentication failure cannot downgrade to 2D.
- An uncertain capture response stays pending for investigation; do not retry the Sale or instruct the donor to pay again. This release does not add an automatic inquiry/recovery worker for uncertain 3D captures.
- Bank code 59 is retained. Selecting 3D cannot guarantee that the bank will accept a card, and this release does not establish the cause of `Fraud Şüphesi`.
- No real payment, refund, recurring-charge job or outbound campaign is part of the local verification.

Before production use, run the existing read-only readiness audit on the VPS. `oneTimePayments.twoDConfigured` and `threeDConfigured` confirm presence of configuration, not bank permissions or transaction success. The 3D terminal requires the matching `ALBARAKA_TERMINAL_NO`, `ALBARAKA_POSNET_ID`, merchant and encryption key, plus the bank-registered production return domain. Never paste credentials in chat.

## Content and dashboard

- Tiptap loads existing content at initialization; changing editability does not emit an empty edit that overwrites the parent draft.
- Languages are visible as compact native-labelled codes. Proofreading uses the same language and produces reviewable proposals; publishing still requires explicit save.
- The content/SEO workspace combines public-page SEO and editorial planning, preserves drafts when switching tools, and retains each tool's existing permission.
- Project updates, translations, media and the link to the communication preparation wizard are available in the unified editor. Opening the wizard does not send a message. Old settings routes remain for compatibility but are no longer exposed as editor navigation.
- Bulk URL review supports exclusions, preserves excluded fallback URLs, and uses existing redirect/reservation history. A failed batch rolls back together.
- No-goal public project cards/panels omit raised money. Administrative financial totals remain read-only.
- Main dashboard filters table/chart/statistics/export by stored gateway metadata and shows the donation locale. Duplicate metric cards are removed and the separate fundraiser/referral entry is restored.
- Country is the donor-account/phone snapshot, not campaign-name geography. A campaign named for Germany does not prove the donor resides there; historical mismatches need production evidence.
- Failed campaign deliveries can be reviewed in the existing scoped retry workflow, which retains recipient checks. No successful deliveries are restarted by opening the dialog.
- Smart audiences can exclude actual marketing sends across all channels within a chosen number of days. Receipts and failed sends do not count; dispatch rechecks recent contact.
- Foundation identity data and defaults use Minber-i Aksa. Existing database brand records are not deleted. Historical encryption associated-data strings remain unchanged so saved credentials still decrypt.

## Google Ads reporting

The GA4 dashboard has a separate, on-demand read-only Google Ads report for campaigns, keywords and search terms. Reports use the selected period in the Ads account timezone, cost in that account's currency, and Google-reported conversions. These conversions must not be treated as settled donation revenue. Results are bounded to the highest-cost 50 campaigns and 100 keyword/search-term rows; recommendations are review candidates, not automatic ad/SEO changes or a complete account audit.

The report uses an enabled saved `GOOGLE_ADS` marketing connection. With multiple accounts a default must be configured. When no enabled connection exists, an administrator can configure server-only variables:

- `GOOGLE_ADS_CUSTOMER_ID`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_MANAGER_ID` if required by an MCC
- `GOOGLE_ADS_API_VERSION`, optional, defaults to `v26`

OAuth authorization and Google Ads user/account access are separate from the GA4 service-account connection. Use a Google Ads user with read access. The implementation only refreshes OAuth and runs fixed SELECT reporting queries; it has no mutation, budget or publication endpoint. Missing credentials/access produce an explicit error, never zero-valued success. The older scheduled snapshot sync remains a separate pre-existing stub; this on-demand report does not claim to enable that sync.

Official API contract: https://developers.google.com/google-ads/api/rest/common/search

## Verification limits

Tests use the actual React editors and checkout, synthetic HTTP/database/auth boundaries, and intercepted bank navigation. They cover desktop/mobile Arabic, English and Turkish, rich-text loading/editing, drafts, uploads, proposal review, URL controls, updates, and payment-mode handoff. Route-level payment tests use the actual handlers with isolated bank/database dependencies and real MAC helpers.

A production build needs server environment and database access. Follow the normal VPS deployment script after CI passes; inspect build completion and PM2 health. A full live 3D test and next scheduled recurring installment require independent bank/provider evidence after deployment. Do not manually trigger financial cron routes as a UI test.
