---
"@pulgueta/wompi-convex": minor
---

Initial release: subscriptions and product checkouts for Wompi on Convex.

- One-time checkouts through Wompi Web Checkout: `wompi.checkout()` creates a referenced pending payment and a signed redirect URL; `confirmTransaction` reconciles the redirect return through the same idempotent state machine webhooks use.
- Subscriptions on saved cards: browser-side tokenization (`useWompiTokenizer` from `/react`), payment-source creation, initial charge, trials, calendar-aware renewals, dunning retries with configurable schedule, cancel-at-period-end, resume, and renewal-time plan changes.
- A billing engine Wompi doesn't have: an app-owned cron (`wompi.billing()`) claims due charges with deterministic references and leases (double-charge-safe by construction), finalizes cancellations, reconciles stale pendings against the Wompi API, and prunes the webhook event log.
- Webhooks: `registerRoutes(http)` mounts a checksum-verified endpoint with replay dedupe, amount/currency guards against forged references, and exactly-once `onPaymentChange`/`onSubscriptionChange` callbacks.
- Reactive by default: customers, products, payment sources, subscriptions and payments are component tables; `wompi.api()` exposes prebuilt queries/actions (`getCurrentSubscription`, `listPayments`, `subscribe`, …) that resolve identity through your `getUserInfo` bridge.

Secrets stay in your deployment's environment variables — the component stores billing state only.
