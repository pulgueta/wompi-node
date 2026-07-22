---
"@pulgueta/wompi": minor
---

Add BRE-B dispersions to `WompiPayoutsClient`.

- New `resolveBrebKey(keyValue, keyType?)` previews the masked holder of a BRE-B key (`GET /v2/breb/keys/resolve/{keyValue}`) before paying it.
- `createPayout` transactions now pay either a bank account or a BRE-B `key` — mixed batches included — and the batch is routed to `/v2/payouts` automatically whenever any transaction carries a `key`.
- New `BrebKeyType`, `BrebFinancialEntity` and `BrebKeyResolution` schemas/types in `@pulgueta/wompi/schemas`, plus typed BRE-B payee fields (`key`, `keyType`, `personType`, `keyResolutionId`, `paymentMethodType`) on payout `transaction.updated` webhook events.
