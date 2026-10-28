# Compact revenue indicators and Prisma query compatibility

Source baseline: `e97d55fa4f1acbadb974bf01eb975bbc5b9496af`. Production publishing is deferred at the user's request; these changes join the pending dashboard/AI connection release.

## Revenue indicators

Reduce the six indicator cards' padding, icon size, heading/number spacing and footer size. Keep their colours, labels, counts, average donation, currency formatting and responsive column arrangement. The all-time summary band is preserved. Browser validation checks all six cards at desktop/390px/320px in AR/EN/TR and captures the resulting layouts.

## Reported deployment results

The supplied VPS log confirms deployment and PM2 reload of `e9bcd87`, twelve installed cron routes, and successful verification of expected content indexes. It also contains a failed campaign revenue read: `findRaw` rejected numeric `maxTimeMS` with `expected struct Duration`. This is an application query compatibility error after deployment, not a successful zero-revenue result.

The pinned Prisma 6.19.3 engine deserializes `FindOptions.maxTimeMS` as Rust Duration. Supply `{ secs: 15, nanos: 0 }`, which the driver serializes to MongoDB's 15000-millisecond limit. Keep the filtered ID projection, pagination, historical UTM aliases and settled-revenue rules.

A regression uses the installed Prisma engine and an isolated local socket. It reproduces the numeric-option rejection (`P2023`) and confirms the corrected selector passes option parsing and reaches transport (`P2010`). No database credentials, records or provider calls are used.

Parallel attribution reads now finish before a read failure propagates. This prevents CLI cleanup from disconnecting the database while a sibling or nested query remains active, a failure pattern consistent with the trailing empty-engine response in the supplied log. Tests cover both sibling and nested failures. Failed reads still reject and never become zero income.

No production settings, messages, payments, scheduled tasks or data were changed during this work. Live acceptance follows the later combined VPS deployment.
