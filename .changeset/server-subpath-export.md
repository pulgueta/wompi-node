---
"@pulgueta/wompi": major
---

**Breaking changes**

- The package root (`@pulgueta/wompi`) now exports only `WompiClient`. The integrity-signature helper `getSignatureKey` (and its `GetSignatureKeyOptions` type) moved to a new `@pulgueta/wompi/server` subpath, keeping the signing/crypto logic out of client bundles. Zod schemas, inferred types and error classes all live under `@pulgueta/wompi/schemas`.
- Client methods now resolve to the entity directly instead of Wompi's `{ data, meta }` envelope. Read `response.status`, not `response.data.status`.

Migration:

```diff
- import { WompiClient, getSignatureKey } from "@pulgueta/wompi";
+ import { WompiClient } from "@pulgueta/wompi";
+ import { getSignatureKey } from "@pulgueta/wompi/server";

- const [error, res] = await wompi.transactions.getTransaction(id);
- res.data.status;
+ const [error, transaction] = await wompi.transactions.getTransaction(id);
+ transaction.status;
```
