---
"@pulgueta/wompi-convex": minor
---

Add Nequi subscriptions and payment source replacement.

**Nequi subscriptions.** `subscribe({ type: "NEQUI" })` now accepts a token
that the customer did not approve yet. The subscription waits as `incomplete`
(or `trialing`), nothing is charged, and the result has
`awaitingApproval: true`. The payments webhook now applies
`nequi_token.updated`: an approval creates the Wompi payment source and
charges the first period, and a refusal cancels the subscription with
`lastError`. Before, the event was ignored and the charge failed.

**Payment source replacement.** The new
`wompi.updateSubscriptionPaymentSource(ctx, { subscriptionId, token, type?, paymentMethod? })`
replaces the source of a live subscription. The period, the trial and the
dunning counters do not change. A `past_due` subscription becomes due
immediately, so the next billing run charges the new source.

New in `api()`: `updateSubscriptionPaymentSource` and `getNequiTokenStatus`
(a reactive query for an "approve in your Nequi app" screen). New in
`useWompiTokenizer`: `tokenizeNequi(phoneNumber)`.

The results of `subscribe` have a new `awaitingApproval` field.

**Schema.** The `paymentSources` table has two new optional fields, `tokenId`
and `subscriptionId`, and a new `by_token_id` index. `wompiSourceId` is now
optional. Rows that exist stay valid, so no migration is necessary.
