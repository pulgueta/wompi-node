# @pulgueta/wompi

This is the **unofficial** Wompi SDK. This package features a simpler abstraction for the Wompi API, making it easier to interact as a developer and to integrate into your projects.

## Installation

To install this package, you can use NPM, Yarn, or PNPM:

```bash
npm install @pulgueta/wompi
```

```bash
yarn add @pulgueta/wompi
```

```bash
pnpm add @pulgueta/wompi
```

`zod` (v4) is a peer dependency — install it alongside the SDK if it is not already in your project.

## Usage

### Creating a client

Create a client with the keys from your Wompi dashboard. Only `publicKey` is
required; `privateKey` unlocks the private endpoints (listing transactions,
voiding, payment sources, payment links), and `sandbox` switches the base URL
from production to the sandbox.

```typescript
import { WompiClient } from "@pulgueta/wompi";

const wompi = new WompiClient({
  publicKey: process.env.WOMPI_PUBLIC_KEY!,
  privateKey: process.env.WOMPI_PRIVATE_KEY, // optional
  sandbox: true, // optional, defaults to false (production)
});
```

`WompiClient` is also exported from the `@pulgueta/wompi/client` subpath.

### Error handling

Every client method returns an error-first tuple — `[error, data]` — instead of
throwing. When `error` is `null`, `data` holds the parsed response; when `error`
is set, `data` is `null`.

```typescript
const [error, response] = await wompi.transactions.getTransaction("txn-id");

if (error) {
  // `error` is a `WompiError`, or one of its subclasses: `WompiNotFoundError`,
  // `WompiValidationError`, `WompiRequestError`.
  console.error(error.message);
  return;
}

console.log(response.data.status); // fully typed
```

### Creating a transaction

A card transaction needs an acceptance token, a card token, and an integrity
signature:

```typescript
import { WompiClient } from "@pulgueta/wompi";
import { getSignatureKey } from "@pulgueta/wompi/server";

const wompi = new WompiClient({
  publicKey: process.env.WOMPI_PUBLIC_KEY!,
  privateKey: process.env.WOMPI_PRIVATE_KEY,
  sandbox: true,
});

// 1. Acceptance token from the merchant.
const [merchantError, merchant] = await wompi.merchants.getMerchant();
if (merchantError) throw merchantError;
const acceptanceToken = merchant.data.presigned_acceptance?.acceptance_token;

// 2. Tokenize the card.
const [tokenError, token] = await wompi.tokens.tokenizeCard({
  number: "4242424242424242",
  cvc: "123",
  exp_month: "12",
  exp_year: "29",
  card_holder: "Pedro Pérez",
});
if (tokenError) throw tokenError;

// 3. Sign the reference + amount with your integrity key.
const reference = `order-${Date.now()}`;
const amountInCents = 2_490_000;
const signature = await getSignatureKey({
  reference,
  amountInCents,
  integrityKey: process.env.WOMPI_INTEGRITY_KEY!,
});

// 4. Create the transaction.
const [error, transaction] = await wompi.transactions.createTransaction({
  acceptance_token: acceptanceToken,
  amount_in_cents: amountInCents,
  currency: "COP",
  signature,
  customer_email: "buyer@example.com",
  reference,
  payment_method: { type: "CARD", token: token.data.id, installments: 1 },
});
if (error) throw error;

console.log(transaction.data.id, transaction.data.status);
```

### Computing the integrity signature

`getSignatureKey` produces the SHA-256 signature Wompi requires. `amountInCents`
is hashed as-is — it is already in cents and must not be multiplied — and
`expirationTime` is passed only when the transaction also sets `expiration_time`.

```typescript
import { getSignatureKey } from "@pulgueta/wompi/server";

const signature = await getSignatureKey({
  reference: "order-12345",
  amountInCents: 2_490_000,
  integrityKey: process.env.WOMPI_INTEGRITY_KEY!,
  currency: "COP", // optional, defaults to "COP"
  // expirationTime: "2025-01-01T00:00:00.000Z", // optional
});
```

### Available operations

| Namespace | Methods |
| --- | --- |
| `wompi.merchants` | `getMerchant()` |
| `wompi.transactions` | `getTransaction(id)`, `listTransactions(params)`, `createTransaction(input)`, `voidTransaction(id, input?)` |
| `wompi.tokens` | `tokenizeCard(input)`, `tokenizeNequi(input)`, `getNequiToken(id)` |
| `wompi.paymentSources` | `getPaymentSource(id)`, `createPaymentSource(input)` |
| `wompi.paymentLinks` | `getPaymentLink(id)`, `createPaymentLink(input)`, `updatePaymentLink(id, input)` |
| `wompi.pse` | `getFinancialInstitutions()` |

`listTransactions`, `voidTransaction`, and every `paymentSources` / `paymentLinks`
write requires a `privateKey`.

### Subpath exports

| Import | Contents |
| --- | --- |
| `@pulgueta/wompi` | `WompiClient`, `WompiRequest` |
| `@pulgueta/wompi/client` | `WompiClient` |
| `@pulgueta/wompi/server` | `getSignatureKey` |
| `@pulgueta/wompi/errors` | `WompiError` and its subclasses |
| `@pulgueta/wompi/types` | The inferred TypeScript types |
| `@pulgueta/wompi/schemas` | The Zod schemas |
