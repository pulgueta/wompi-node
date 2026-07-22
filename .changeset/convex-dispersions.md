---
"@pulgueta/wompi-convex": minor
---

Add payout dispersion (Pagos a Terceros) tracking to the Convex component.

- New `dispersions` and `dispersionTransactions` tables record payout batches keyed by Wompi payout id, updated in place from `payout.updated` / `transaction.updated` webhook events — including batches created outside the component.
- New `createDispersion` creates a bank/BRE-B batch through `WompiPayoutsClient` (idempotency-key protected) and records it; `resolveBrebKey` previews the masked holder of a BRE-B key; `getDispersion` / `listDispersions` expose reactive batch status.
- `registerRoutes` now also mounts a Payouts events endpoint (default `/wompi/payouts-webhook`, configurable via `payoutsPath`) verified with the separate `WOMPI_PAYOUTS_EVENTS_KEY` secret, deduplicated by checksum, with a new `events.onDispersionChange` callback firing exactly once per batch state change.
- New optional `payouts` config (`apiKey`, `userPrincipalId`, `eventsKey`, with `WOMPI_PAYOUTS_*` env fallbacks); apps not using dispersions are unaffected.
