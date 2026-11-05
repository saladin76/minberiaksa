# Independent cadences in one Albaraka checkout

The cart button, checkout client and order validator now accept one-time, daily, Friday and monthly gifts together. The first recurring type remains only the routing anchor. The request carries each line's frequency and per-cadence schedule.

For a multi-cadence basket the server prices disjoint cadence groups and creates their donations/subscriptions in one transaction. One-time donations have no subscription. Each recurring plan has its own amount, consent, schedule, next date and allocations. Optional recurring team support is distributed across plans proportionally; one-time support is collected once. Covered fees and rounding preserve the initial total.

A versioned server-side manifest joins up to four donation records for one initial Albaraka 2D sale. All recurring plans receive the authorized encrypted card without retaining CVV. Linked child donations cannot initiate separate charges. Group membership, donor, currency, unpaid state, plan provider and combined amount are checked before the bank call. Settlement/failure applies atomically to all group members; each plan activates only after payment. Later workers collect only that plan's amount, on that plan's schedule. Existing two-record manifests and homogeneous checkouts remain supported.

150 focused tests passed locally. The connected test reproduces four 1 TRY gifts (one-time/daily/Friday/monthly), verifies 4 records and 3 plans, captures exactly 4 TRY in 2D, checks paid allocation and saved-card linkage, exercises replay and simultaneous renewal workers, and verifies a decline fails all plans without future billing. Other tests cover distinct schedules, malformed secondary schedules, support and fees, legacy manifests and workers. Changed sources pass syntax checks and unused-variable lint; the manifest helper passes strict TypeScript checking.

Full server release gates and bank acceptance remain separate. No real payment or donor message was submitted locally. No historical records are migrated.
