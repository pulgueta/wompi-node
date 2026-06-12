# Changelog

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
