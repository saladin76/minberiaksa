# Dashboard totals and campaign revenue

The home page retains the compact all-time summary, including successful revenue, MRR, donation count, active subscriptions, users and the added all-time donation average. These values use the existing unfiltered stats and remain stable when the table provider/period changes. The six period cards keep their separate Istanbul calendar definitions and monthly gross average, with colored icon tiles and responsive typography.

## Campaign outcomes

- Recognize the actual `utm_medium=messaging` links used in approved WhatsApp templates.
- Tag outgoing email/SMS donation destinations and approved terminal dynamic WhatsApp URL suffixes with the exact campaign ID. Preserve the approved Meta URL prefix, locale, referral parameters and private-document links. Apply the same rules to campaign retries; no retry is initiated by this change.
- Static approved WhatsApp URLs cannot be changed per send. The campaign list flags these templates even if a separate tracking link was attached. For a new Meta-approved template, retain each destination and language, append `&utm_id={{1}}` to the donation button URL, and keep the rest of the approved content. Campaign execution binds that button-scoped parameter to the campaign ID without borrowing the donor-name body value. A template approval/update is still required before that path can be used. Shared historical campaign aliases remain unassigned; confirmed communication income without a unique campaign is visible separately and is never added to multiple campaign rows.
- Require `status=PAID` and `paidAt`. Preserve cents; never treat unconverted TRY/EUR as USD. Surface unconverted counts. Walk all donation pages, and return an error when a report read or alias scan is incomplete instead of reporting zero.
- Retain provider acceptance after a later delivery failure. A reply is not counted as a URL click.
- Meta template performance now reads `CommunicationDelivery`, with confirmed revenue attributed through the template's campaigns or its explicit legacy template UTM. It no longer reads only the inactive `SentMessage` archive or manufactures clicks from donations.

## WhatsApp review

The live archive contains real provider acceptance, delivery/read events, Meta ecosystem/undeliverable rejections and records bearing the retired internal opt-in reason. Source changes preserve STOP/do-not-contact. The cause of historical/late retired-policy records still requires correlating listener startup, build and record timestamps on the VPS; repository HEAD alone does not prove which build a listener loaded. Vercel inspection found the current source deployment but no communication-run-due logs in the inspected two-hour window, so parallel Vercel execution was not established.

The delivery preview's sticky header previously covered its close control. The local fix keeps that control above the header and reserves space for it.

No real message, campaign retry, payment, refund or financial cron is executed by these changes or fixture tests.

## Read-only VPS verification

After deploying this source, run from `/root/minberiaksa`:

```bash
node --import tsx scripts/audit-communication-runtime.mjs
```

The report prints runtime/build evidence, anonymous failure counts and confirmed attributed/unattributed revenue. It never prints contacts, donor IDs, keys, tokens, process environments or message bodies; it makes no provider calls, database writes, sends or cron execution requests. A real messaging acceptance test still needs a designated test recipient and an approved template; fixture success does not establish live provider delivery.
