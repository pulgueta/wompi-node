---
"@pulgueta/wompi": major
---

**Breaking:** the package root (`@pulgueta/wompi`) now exports only `WompiClient`. The integrity-signature helper `getSignatureKey` (and its `GetSignatureKeyOptions` type) moved to a new `@pulgueta/wompi/server` subpath, keeping the signing logic out of client bundles.

Update your imports:

```diff
- import { WompiClient, getSignatureKey } from "@pulgueta/wompi";
+ import { WompiClient } from "@pulgueta/wompi";
+ import { getSignatureKey } from "@pulgueta/wompi/server";
```
