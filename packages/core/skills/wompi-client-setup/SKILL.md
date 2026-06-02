---
name: wompi-client-setup
description: >
  Initialize WompiClient from @pulgueta/wompi. Covers publicKey, privateKey,
  sandbox flag, the error-first Result<T> tuple [error, data] that every
  SDK method returns, WompiError subclass narrowing (.type on NOT_FOUND_ERROR /
  INPUT_VALIDATION_ERROR, .statusCode on request errors), and subpath exports
  (/server, /schemas). Load when setting up the SDK,
  configuring API keys, or writing error-handling code.
type: core
library: '@pulgueta/wompi'
library_version: "3.0.0"
sources:
  - "pulgueta/wompi-node:packages/core/src/client/index.ts"
  - "pulgueta/wompi-node:packages/core/src/request.ts"
  - "pulgueta/wompi-node:packages/core/src/schemas.ts"
  - "pulgueta/wompi-node:packages/core/src/server.ts"
  - "pulgueta/wompi-node:packages/core/README.md"
---

## Setup

```typescript
import { WompiClient } from '@pulgueta/wompi';

const wompi = new WompiClient({
  publicKey: process.env.WOMPI_PUBLIC_KEY!,
  privateKey: process.env.WOMPI_PRIVATE_KEY!, // required for admin operations
  sandbox: process.env.NODE_ENV !== 'production', // defaults to false (production)
});
```

`WompiClient` validates options with Zod at construction time and throws `WompiError` synchronously if `publicKey` is missing or empty. Every subsequent method call returns an error-first tuple — it never throws.

## Core Patterns

### Destructure and check the [error, data] tuple

Every SDK method returns `Promise<[error, data]>`. When `error` is non-null, `data` is `null` and vice versa.

```typescript
const [error, merchant] = await wompi.merchants.getMerchant();

if (error) {
  console.error(error.message);
  return;
}

// data is fully typed here
console.log(merchant.name);
```

### Narrow error types without instanceof

`WompiNotFoundError` and `WompiValidationError` carry a `.type` discriminant. `WompiRequestError` carries `.statusCode`. Use these to branch without `instanceof`.

```typescript
import type { WompiErrorResult } from '@pulgueta/wompi/schemas';

function handleError(error: WompiErrorResult) {
  if ('type' in error && error.type === 'NOT_FOUND_ERROR') {
    console.error('Not found:', error.reason);
    return;
  }
  if ('type' in error && error.type === 'INPUT_VALIDATION_ERROR') {
    console.error('Validation:', error.messages);
    return;
  }
  if ('statusCode' in error) {
    console.error('HTTP error:', error.statusCode, error.body);
    return;
  }
  console.error('SDK error:', error.message);
}
```

### Import from the correct subpath

```typescript
import { WompiClient } from '@pulgueta/wompi';            // the client (only root export)
import { getSignatureKey } from '@pulgueta/wompi/server'; // server-side signature util
import { WompiError } from '@pulgueta/wompi/schemas';    // error classes
import type { Transaction } from '@pulgueta/wompi/schemas'; // TypeScript types
import { CreateTransactionInputSchema } from '@pulgueta/wompi/schemas'; // Zod schemas
```

### Public-key-only client (read-only use cases)

When you only need public operations (get transaction, tokenize, PSE lookup), omit `privateKey`. Methods that require it will return `[WompiError, null]` rather than throw.

```typescript
const wompi = new WompiClient({
  publicKey: process.env.WOMPI_PUBLIC_KEY!,
  sandbox: true,
});

// Public operations work fine
const [error, txn] = await wompi.transactions.getTransaction('txn-123');

// Private operations return an error tuple — they do not throw
const [listError, list] = await wompi.transactions.listTransactions();
// listError.message === "Private key is required for this operation"
```

## Common Mistakes

### HIGH Calling private-key methods without providing privateKey

Wrong:

```typescript
const wompi = new WompiClient({ publicKey: process.env.WOMPI_PUBLIC_KEY! });

const [error, data] = await wompi.transactions.listTransactions();
// error.message === "Private key is required for this operation"
// data === null — silent failure, no throw
```

Correct:

```typescript
const wompi = new WompiClient({
  publicKey: process.env.WOMPI_PUBLIC_KEY!,
  privateKey: process.env.WOMPI_PRIVATE_KEY!,
});
```

Operations requiring `privateKey`: `listTransactions`, `voidTransaction`, `paymentSources.*`, `paymentLinks.createPaymentLink`, `paymentLinks.updatePaymentLink`.

Source: `packages/core/src/client/transactions/index.ts`, `payment-sources/index.ts`, `payment-links/index.ts`

---

### HIGH `sandbox` defaults to `false` — omitting it hits production

Wrong:

```typescript
// No sandbox flag — this hits https://production.wompi.co/v1
const wompi = new WompiClient({ publicKey: process.env.WOMPI_PUBLIC_KEY! });
```

Correct:

```typescript
const wompi = new WompiClient({
  publicKey: process.env.WOMPI_PUBLIC_KEY!,
  sandbox: process.env.NODE_ENV !== 'production',
});
```

Sandbox keys used against production return auth errors. Production keys used against sandbox may process real charges during testing.

Source: `packages/core/src/request.ts`

---

### HIGH Not checking the error tuple before reading data

Wrong:

```typescript
const [, data] = await wompi.merchants.getMerchant();
console.log(data.name); // TypeError: Cannot read properties of null
```

Correct:

```typescript
const [error, data] = await wompi.merchants.getMerchant();
if (error) {
  console.error(error.message);
  return;
}
console.log(data.name); // safe — data is typed and non-null
```

The SDK never throws on API errors. When the request fails, `data` is `null` and accessing it throws a null-dereference — the only signal that something went wrong.

Source: `packages/core/src/schemas.ts`

---

### HIGH Tension: Error-first tuple vs promise rejection

The SDK returns `[error, data]` — it does not reject the promise or throw on API failures. Wrapping calls in `try/catch` catches nothing for declined transactions, 404s, or validation errors.

```typescript
// This try/catch is useless for API errors — the SDK never throws
try {
  const result = await wompi.transactions.createTransaction(input);
} catch (e) {
  // only catches network-level or constructor errors
}
```

Always destructure and check `error` from the tuple.

See also: `wompi-transactions/SKILL.md` § Common Mistakes

## See also

- `wompi-transactions/SKILL.md` — key requirements per operation
- `wompi-go-to-production/SKILL.md` — environment variable setup and sandbox switching
