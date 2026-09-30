# Changelog

## 0.5.0

### Minor Changes

- [#53](https://github.com/pulgueta/wompi-node/pull/53)
  [`f731ada`](https://github.com/pulgueta/wompi-node/commit/f731ada28d51d7a50bdfe7241ff31495bb010183)
  Thanks [@pulgueta](https://github.com/pulgueta)! - Remove the scale limits of
  the billing engine and document the ones that stay.
  - **Charges run in parallel.** `processBilling` keeps five Wompi requests in
    flight at the same time. Before, it charged one subscription at a time.
  - **The cron does not wait for a result.** A renewal that Wompi keeps
    `PENDING` keeps its transaction id. The webhook or the next run resolves it.
    Before, each pending renewal added two waits of `pollIntervalMs` to the run.
    `subscribe` and `confirmTransaction` continue to poll.
  - **`ProcessBillingSummary.remaining`.** It is `true` when the run left due
    subscriptions or stale payments for an immediate next run. The README shows
    an action that schedules itself with it.
  - **The stale sweep rotates.** Each run continues after the last payment that
    the previous run visited, oldest first. At the end of the stale payments,
    the pass is complete. Before, it read the 50 oldest pending payments in each
    run, so payments that stayed pending kept all later ones out of reach. An
    abandoned checkout that cannot expire yet does not use a place in the batch.
  - **The stale sweep waits between passes.** A new pass starts only when
    `pendingSweepAfterMs` has passed since the start of the last pass. Thus runs
    that schedule themselves do not ask Wompi about the same payments again and
    again. Two runs at the same time do not get the same payments.
  - **The stale sweep has a read limit.** It stops when less than 4 MiB of the
    read limit of the transaction remains. Thus large `metadata` does not make
    the run fail. The limit is not exact for payments with the same creation
    time.
  - **Fix: `onSubscriptionChange` runs for a subscription with no available
    payment source.** Before, a billing run could move such a subscription to
    `past_due` or to a final status and not run the callback.

  **Removed:** the component query `payments.listStalePending`. The mutation
  `payments.claimStalePending` replaces it. A host app that calls the query
  directly must change the call.

  The component has a new table, `sweepCursors`, with one row: the position of
  the sweep. The sweep writes no payment row. The `payments` table and its
  indexes do not change. No data migration is necessary.

- [#52](https://github.com/pulgueta/wompi-node/pull/52)
  [`881c382`](https://github.com/pulgueta/wompi-node/commit/881c382b3b5d99559fd08e605fc2f2f3a07045c9)
  Thanks [@pulgueta](https://github.com/pulgueta)! - Add Nequi subscriptions and
  payment source replacement.

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

  New in `api()`: `updateSubscriptionPaymentSource` and `getNequiTokenStatus` (a
  reactive query for an "approve in your Nequi app" screen). New in
  `useWompiTokenizer`: `tokenizeNequi(phoneNumber)`.

  The results of `subscribe` have a new `awaitingApproval` field.

  **Schema.** The `paymentSources` table has three new optional fields,
  `tokenId`, `subscriptionId` and `activationClaimedAt`. `wompiSourceId` is now
  optional. The new `nequiTokens` table finds the payment source of a Nequi
  token. No table that exists has a new index, and rows that exist stay valid,
  so no migration is necessary.

### Patch Changes

- [#50](https://github.com/pulgueta/wompi-node/pull/50)
  [`5077436`](https://github.com/pulgueta/wompi-node/commit/5077436471c215815ba5613e74b426ab3cd496e6)
  Thanks [@pulgueta](https://github.com/pulgueta)! - Send the Credential-on-File
  flag on subscription charges.

  The initial charge, each renewal and each dunning retry now send the
  `recurrent` flag to Wompi together with the `payment_source_id`. The flag is
  `true` when the amount matches the last approved charge. It is `false` when
  the amount changes, for example after a plan change.

  For MasterCard and VISA cards on the RBM processor, Wompi marks the charge as
  a stored-credential transaction, which raises the approval rate. Wompi
  processes the charge without the flag when the franchise or the processor does
  not support it.

  One-time checkouts do not change.

- Updated dependencies
  [[`9a30116`](https://github.com/pulgueta/wompi-node/commit/9a3011675c5025046810aa49ad2be3816a19ec35),
  [`a686f41`](https://github.com/pulgueta/wompi-node/commit/a686f41fbdf6e92c005a46abf0a5ac8a7c9e9b78)]:
  - @pulgueta/wompi@3.4.0

## 0.4.0

### Minor Changes

- [#45](https://github.com/pulgueta/wompi-node/pull/45)
  [`5b4ad54`](https://github.com/pulgueta/wompi-node/commit/5b4ad54d6f2c193c070e90e858706cebc8465ca6)
  Thanks [@pulgueta](https://github.com/pulgueta)! - Make
  `events.onPaymentChange` atomic.

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

  The callback receives `{ payment, previousStatus }`. `payment` is the row
  after the change, including `metadata`; `previousStatus` tells a first
  approval apart from a later `VOIDED` or refund of a payment you already
  credited. Declare the arguments with the new exported `paymentChangeArgs`
  validator.

  Also adds `wompi.getPayment(ctx, { reference })`, which answers from the
  `by_reference` index and returns `null` for an unknown reference.

  Fixes a missed callback: a renewal finalized as `error` because its payment
  source was unavailable changed the payment row without ever reaching
  `onPaymentChange`. It now does.

  **Breaking.** The inline `onPaymentChange: async (ctx, payment) => {}` form is
  gone — it cannot be run inside the component's transaction, so keeping it
  would mean keeping the non-atomic path it exists to remove. Move the body into
  an `internalMutation` and pass the reference. `onSubscriptionChange` and
  `registerRoutes({ onEvent })` are unchanged. This is a minor bump because the
  package is still `0.x`, where a caret range does not cross a minor and the
  public API is explicitly unstable (semver §4).

## 0.3.0

### Minor Changes

- [#43](https://github.com/pulgueta/wompi-node/pull/43)
  [`af39b0b`](https://github.com/pulgueta/wompi-node/commit/af39b0bc7c78b0f1d961c9b1443eb9d22fa7bac4)
  Thanks [@pulgueta](https://github.com/pulgueta)! - Production-readiness fixes
  for the billing engine and the prebuilt API.
  - Payments: a declined, errored or expired row can still be approved (or
    voided) by a later Wompi transaction that shares the reference — Web
    Checkout payer retries no longer strand a paid order. Superseded transaction
    ids are kept in `supersededTransactionIds`.
  - Charges whose response never arrived (timeout, 5xx, network) are left
    pending instead of being finalized as `error`, so the next attempt reuses
    the same reference and reconciles the existing transaction instead of
    charging twice. The sweep also looks tx-less rows up by reference.
  - `subscribe` called twice while the first charge is in flight reuses the same
    pending payment instead of minting a second one. Resume charges are numbered
    by a `resumeAttempts` counter on the subscription (new optional field) and
    pending rows are found through a new `payments.by_subscription_id_status`
    index.
  - A duplicate-reference rejection whose follow-up lookup fails leaves the
    payment pending for the sweep instead of finalizing it as `error`; when
    Wompi holds several transactions for one reference, an approved one wins,
    then the newest.
  - Payments webhook: a redelivery whose first delivery crashed after being
    recorded is reprocessed instead of short-circuited.
  - `api().confirmTransaction` requires a signed-in user and redacts payments of
    other users; `api().checkout` now only accepts a catalog `productKey` (use
    `wompi.checkout(ctx, …)` server-side for custom amounts/metadata).
  - Both Wompi acceptance tokens (`acceptance_token`, `accept_personal_auth`)
    are sent on payment sources and charges — `subscribe` fails when the
    merchant exposes only one; `useWompiTokenizer` exposes
    `personalDataAuthPermalink` and clears both links when the client changes;
    payment sources record `termsAcceptedAt`.
  - `registerRoutes({ onEvent })` is documented as at-least-once: make the
    callback idempotent.
  - Packaging: `publishConfig.access` set, `react` peer dependency marked
    optional, `build` always cleans `dist`.

### Patch Changes

- Updated dependencies
  [[`4bd636e`](https://github.com/pulgueta/wompi-node/commit/4bd636e141155490fb37ef684ec8394f8038c983),
  [`2b7012c`](https://github.com/pulgueta/wompi-node/commit/2b7012c81dcbf2ef2f89bda8edd078126b39fee8)]:
  - @pulgueta/wompi@3.3.0

## 0.2.0

### Minor Changes

- [#30](https://github.com/pulgueta/wompi-node/pull/30)
  [`a341aa8`](https://github.com/pulgueta/wompi-node/commit/a341aa8b5e6afe4c86baf78997b825a308a25bac)
  Thanks [@pulgueta](https://github.com/pulgueta)! - Add payout dispersion
  (Pagos a Terceros) tracking to the Convex component.
  - New `dispersions` and `dispersionTransactions` tables record payout batches
    keyed by Wompi payout id, updated in place from `payout.updated` /
    `transaction.updated` webhook events — including batches created outside the
    component.
  - New `createDispersion` creates a bank/BRE-B batch through
    `WompiPayoutsClient` (idempotency-key protected) and records it;
    `resolveBrebKey` previews the masked holder of a BRE-B key; `getDispersion`
    / `listDispersions` expose reactive batch status.
  - `registerRoutes` now also mounts a Payouts events endpoint (default
    `/wompi/payouts-webhook`, configurable via `payoutsPath`) verified with the
    separate `WOMPI_PAYOUTS_EVENTS_KEY` secret, deduplicated by checksum, with a
    new `events.onDispersionChange` callback firing exactly once per batch state
    change.
  - New optional `payouts` config (`apiKey`, `userPrincipalId`, `eventsKey`,
    with `WOMPI_PAYOUTS_*` env fallbacks); apps not using dispersions are
    unaffected.

### Patch Changes

- [#24](https://github.com/pulgueta/wompi-node/pull/24)
  [`cdad2c8`](https://github.com/pulgueta/wompi-node/commit/cdad2c884b4223e7a867ca2a8cd168988cd6a84a)
  Thanks [@pulgueta](https://github.com/pulgueta)! - Remove the bundled live
  example app and its development dependencies.

- Updated dependencies
  [[`d94b031`](https://github.com/pulgueta/wompi-node/commit/d94b031a63513560a7144dd4c3136658463f84b9),
  [`2c9f33f`](https://github.com/pulgueta/wompi-node/commit/2c9f33fdc61d4991827121f26986d9f216a47b8a)]:
  - @pulgueta/wompi@3.2.0

## 0.1.0

### Minor Changes

- [#21](https://github.com/pulgueta/wompi-node/pull/21)
  [`99a56d6`](https://github.com/pulgueta/wompi-node/commit/99a56d6252b75f5d028c0e42b1874f02d977e3a9)
  Thanks [@pulgueta](https://github.com/pulgueta)! - Initial release:
  subscriptions and product checkouts for Wompi on Convex.
  - One-time checkouts through Wompi Web Checkout: `wompi.checkout()` creates a
    referenced pending payment and a signed redirect URL; `confirmTransaction`
    reconciles the redirect return through the same idempotent state machine
    webhooks use.
  - Subscriptions on saved cards: browser-side tokenization (`useWompiTokenizer`
    from `/react`), payment-source creation, initial charge, trials,
    calendar-aware renewals, dunning retries with configurable schedule,
    cancel-at-period-end, resume, and renewal-time plan changes.
  - A billing engine Wompi doesn't have: an app-owned cron (`wompi.billing()`)
    claims due charges with deterministic references and leases
    (double-charge-safe by construction), finalizes cancellations, reconciles
    stale pendings against the Wompi API, and prunes the webhook event log.
  - Webhooks: `registerRoutes(http)` mounts a checksum-verified endpoint with
    replay dedupe, amount/currency guards against forged references, and
    exactly-once `onPaymentChange`/`onSubscriptionChange` callbacks.
  - Reactive by default: customers, products, payment sources, subscriptions and
    payments are component tables; `wompi.api()` exposes prebuilt
    queries/actions (`getCurrentSubscription`, `listPayments`, `subscribe`, …)
    that resolve identity through your `getUserInfo` bridge.

  Secrets stay in your deployment's environment variables — the component stores
  billing state only.

### Patch Changes

- Updated dependencies
  [[`6fa999a`](https://github.com/pulgueta/wompi-node/commit/6fa999afc2089bbb411b0bd13e4822b7408973ea)]:
  - @pulgueta/wompi@3.1.0

## 0.0.0

- Initial release.
