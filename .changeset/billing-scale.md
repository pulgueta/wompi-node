---
"@pulgueta/wompi-convex": minor
---

Remove the scale limits of the billing engine and document the ones that stay.

- **Charges run in parallel.** `processBilling` keeps five Wompi requests in
  flight at the same time. Before, it charged one subscription at a time.
- **The cron does not wait for a result.** A renewal that Wompi keeps `PENDING`
  keeps its transaction id. The webhook or the next run resolves it. Before,
  each pending renewal added two waits of `pollIntervalMs` to the run.
  `subscribe` and `confirmTransaction` continue to poll.
- **`ProcessBillingSummary.remaining`.** It is `true` when the run left due
  subscriptions or stale payments for an immediate next run. The README shows an
  action that schedules itself with it.
- **The stale sweep rotates.** It takes the payments it never visited first, then
  the ones it visited least recently. Before, it read the 50 oldest pending
  payments in each run, so payments that stayed pending kept all later ones out
  of reach. An abandoned checkout that cannot expire yet does not use a place in
  the batch.

The `payments` table has a new optional field, `sweptAt`, and the index
`by_status_swept_at` replaces `by_status`. Convex builds the index when you
deploy the new version. No data migration is necessary.
