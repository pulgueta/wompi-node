---
"@pulgueta/wompi-convex": minor
---

Make `events.onPaymentChange` atomic.

`onPaymentChange` is now a reference to an internal app mutation instead of an
inline function. The component runs it inside the transaction that changes the
payment row, so the payment state, the callback's own writes and — on the
webhook path — the delivery record all commit together. A callback that throws
rolls the whole delivery back, and Wompi's retry replays it, instead of the
change committing with the side effect lost.

All three entry points pass the handle: the webhook route
(`webhooks.processTransactionUpdate`, a new component mutation that
deduplicates, applies, calls back and records the outcome in one transaction),
`confirmTransaction`, and the billing cron.

The callback receives `{ payment, previousStatus }`. `payment` is the row after
the change, including `metadata`; `previousStatus` tells a first approval apart
from a later `VOIDED` or refund of a payment you already credited. Declare the
arguments with the new exported `paymentChangeArgs` validator.

Also adds `wompi.getPayment(ctx, { reference })`, which answers from the
`by_reference` index and returns `null` for an unknown reference.

Fixes a missed callback: a renewal finalized as `error` because its payment
source was unavailable changed the payment row without ever reaching
`onPaymentChange`. It now does.

**Breaking.** The inline `onPaymentChange: async (ctx, payment) => {}` form is
gone — it cannot be run inside the component's transaction, so keeping it would
mean keeping the non-atomic path it exists to remove. Move the body into an
`internalMutation` and pass the reference. `onSubscriptionChange` and
`registerRoutes({ onEvent })` are unchanged. This is a minor bump because the
package is still `0.x`, where a caret range does not cross a minor and the
public API is explicitly unstable (semver §4).
