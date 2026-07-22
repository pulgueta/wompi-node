# Changelog

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
