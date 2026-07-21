---
"@pulgueta/wompi": minor
---

Add support for Wompi's Pagos a Terceros (Payouts) API — bank account dispersions.

- New `WompiPayoutsClient` targeting `api.payouts.wompi.co` (and its sandbox), authenticated with `x-api-key` + `user-principal-id` headers: `createPayout` (immediate, scheduled and recurring batches, idempotency-key protected), `createPayoutFromFile` (WOMPI/PAB/SAP/DISFON/BANCO_OCCIDENTE_FC/DAVIVIENDA formats), `listPayouts`, `getPayout`, `listPayoutTransactions`, `getPayoutTransaction`, `listTransactionsByReference`, `listBanks`, `listAccounts`, `getLimits`, `listReports`, `getReportDownloadUrl`, `getHealth` and the sandbox-only `rechargeAccountBalance`.
- New `verifyPayoutEvent`, `isPayoutUpdatedEvent` and `isPayoutTransactionUpdatedEvent` helpers in `@pulgueta/wompi/server` to authenticate `payout.updated` / `transaction.updated` webhook events.
- New payout Zod schemas, inferred types and `WompiPayoutApiError` (carrying the `EXC_*` code and HTTP status) in `@pulgueta/wompi/schemas`.
