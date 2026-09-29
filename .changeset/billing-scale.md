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
- **The stale sweep rotates.** Each run continues after the last payment that
  the previous run visited, oldest first. At the end of the stale payments, the
  pass is complete. Before, it read the 50 oldest pending payments in each run,
  so payments that stayed pending kept all later ones out of reach. An abandoned
  checkout that cannot expire yet does not use a place in the batch.
- **The stale sweep waits between passes.** A new pass starts only when
  `pendingSweepAfterMs` has passed since the start of the last pass. Thus runs
  that schedule themselves do not ask Wompi about the same payments again and
  again. Two runs at the same time do not get the same payments.
- **The stale sweep has a read limit.** It stops when less than 4 MiB of the
  read limit of the transaction remains. Payments with large `metadata` cannot
  make the run fail.

The component has a new table, `sweepCursors`, with one row: the position of
the sweep. The sweep writes no payment row. The `payments` table and its indexes
do not change. No data migration is necessary.
