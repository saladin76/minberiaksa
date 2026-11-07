# Donor giving months and bell-only notifications

This follow-up builds on communication release 2bb50ddacd29201b297d240996da8df42f352937.

- Site notifications are removed from the shared sidebar/navigation catalogue. The top-bar bell, notification page, unread/read markers and existing `logs` permission remain available. The page keeps a localized breadcrumb without needing a sidebar entry.
- The profile donations card becomes “Months of recurring giving” in all 19 public locales. Its number counts distinct calendar year/months with at least one confirmed recurring payment, across daily, Friday and monthly plans. It is neither active subscriptions, attempts, elapsed plan age nor a consecutive-month streak. Multiple payments or plans in one month count once. Past confirmed gifts remain valid after plan cancellation.
- Failed/pending attempts, PAID rows without a valid settlement timestamp, one-time gifts and accelerated QA cycles cannot add recurring months. The selected month/year applies to this card. Successful payments are assigned to their settlement date in the viewer's displayed timezone; failed/pending history retains its creation date. Payment totals and supported-project metrics require settled payments as well.
- The misleading “active subscription” hint is replaced with an explanation of confirmed giving months. Active plans remain a separate concept in the subscriptions section.
- Profile period/payment menus render above the fixed mobile navigation, which previously intercepted the period options during a real mobile browser fixture.

The supplied recurring audit is reference context. This release changes display and navigation, with no bank call, live charge, schedule rewrite, retry-policy change or modification of stored financial evidence. Calendar billing and retry spacing remain separate from how the profile counts successful giving.

Regression coverage includes active plans with repeated failures, multiple paid attempts in one month, cancelled plans with past gifts, QA cycles, one-time gifts, year boundaries, settlement-date versus creation-date filtering and all locale labels. The existing actual-profile browser fixture covers the new card and month/year selection at 320, 390 and 1440 pixels in AR/EN/TR, alongside donor-request and ordering flows.
