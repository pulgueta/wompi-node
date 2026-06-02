---
name: wompi-payment-links
description: >
  Create, retrieve, and manage Wompi hosted payment links using @pulgueta/wompi.
  Covers createPaymentLink (name, description, single_use, collect_shipping,
  amount_in_cents, currency, taxes, customer_data, redirect_url),
  getPaymentLink (no auth required), updatePaymentLink to activate/deactivate,
  Tax union (TaxByAmount with amount_in_cents, TaxByPercentage with percentage 1–50),
  and CustomerReference constraints (max 2, label max 24 chars).
  Load when building hosted checkout pages or no-code payment collection.
type: core
library: '@pulgueta/wompi'
library_version: "3.0.0"
requires:
  - wompi-client-setup
sources:
  - "pulgueta/wompi-node:packages/core/src/client/payment-links/index.ts"
  - "pulgueta/wompi-node:packages/core/src/schemas.ts"
---

This skill builds on `wompi/client-setup`. Read it first for key configuration and the error-first tuple pattern.

## Setup

```typescript
import { WompiClient } from '@pulgueta/wompi';

const wompi = new WompiClient({
  publicKey: process.env.WOMPI_PUBLIC_KEY!,
  privateKey: process.env.WOMPI_PRIVATE_KEY!, // required for create/update
  sandbox: process.env.NODE_ENV !== 'production',
});

// Create a single-use payment link with a fixed amount
const [error, link] = await wompi.paymentLinks.createPaymentLink({
  name: 'Orden #12345',
  description: 'Pago de pedido online',
  single_use: true,
  collect_shipping: false,
  amount_in_cents: 2_490_000,
  currency: 'COP',
  redirect_url: 'https://mystore.co/gracias',
});
if (error) throw error;

console.log(link.id, link.active); // 'link_xxx', true
```

## Core Patterns

### Multi-use payment link (e.g. donation page)

```typescript
const [error, link] = await wompi.paymentLinks.createPaymentLink({
  name: 'Donación voluntaria',
  description: 'Apoya nuestra causa',
  single_use: false,   // reusable
  collect_shipping: false,
  // omit amount_in_cents to let the customer enter the amount
});
if (error) throw error;
```

### Payment link with taxes

`taxes` is an array of `TaxByAmount` or `TaxByPercentage` objects — not both fields in the same object.

```typescript
const [error, link] = await wompi.paymentLinks.createPaymentLink({
  name: 'Producto con IVA',
  description: 'Incluye IVA 19%',
  single_use: true,
  collect_shipping: false,
  amount_in_cents: 1_000_000,
  currency: 'COP',
  taxes: [
    { type: 'VAT', percentage: 19 }, // TaxByPercentage — 1 to 50
    // OR: { type: 'VAT', amount_in_cents: 190_000 } // TaxByAmount
  ],
});
if (error) throw error;
```

### Collect custom customer references

`customer_references` accepts at most 2 items. Each `label` has a maximum of 24 characters.

```typescript
const [error, link] = await wompi.paymentLinks.createPaymentLink({
  name: 'Pago de factura',
  description: 'Ingrese el número de factura',
  single_use: true,
  collect_shipping: false,
  customer_data: {
    customer_references: [
      { label: 'Número de factura', is_required: true },  // max 24 chars
      { label: 'Código cliente',    is_required: false },  // max 2 items total
    ],
  },
});
if (error) throw error;
```

### Retrieve and deactivate a payment link

`getPaymentLink` requires no authentication. `updatePaymentLink` requires `privateKey` and only accepts `{ active: boolean }`.

```typescript
// Retrieve — no privateKey needed
const [getErr, link] = await wompi.paymentLinks.getPaymentLink('link_123');
if (getErr) throw getErr;
console.log(link.active);

// Deactivate
const [updateErr, updated] = await wompi.paymentLinks.updatePaymentLink('link_123', {
  active: false,
});
if (updateErr) throw updateErr;
console.log(updated.active); // false
```

## Common Mistakes

### HIGH Calling `createPaymentLink` or `updatePaymentLink` without `privateKey`

Wrong:

```typescript
const wompi = new WompiClient({ publicKey: process.env.WOMPI_PUBLIC_KEY! });

const [error] = await wompi.paymentLinks.createPaymentLink({ ... });
// error.message === "Private key is required for payment link operations"
// No HTTP call — returns immediately
```

Correct:

```typescript
const wompi = new WompiClient({
  publicKey: process.env.WOMPI_PUBLIC_KEY!,
  privateKey: process.env.WOMPI_PRIVATE_KEY!,
});
```

`getPaymentLink` does NOT require `privateKey`. `createPaymentLink` and `updatePaymentLink` do.

Source: `packages/core/src/client/payment-links/index.ts`

---

### MEDIUM Exceeding `customer_references` array limit or `label` length

Wrong:

```typescript
await wompi.paymentLinks.createPaymentLink({
  customer_data: {
    customer_references: [
      { label: 'Este label tiene más de veinticuatro caracteres', is_required: true },
      { label: 'Ref2', is_required: false },
      { label: 'Ref3', is_required: false }, // third item — max is 2
    ],
  },
  // ...
});
// Returns [WompiError, null] — validation fails before HTTP call
```

Correct:

```typescript
await wompi.paymentLinks.createPaymentLink({
  customer_data: {
    customer_references: [
      { label: 'Número de factura', is_required: true },  // ≤24 chars
      { label: 'Código cliente',    is_required: false },  // max 2 items
    ],
  },
  // ...
});
```

Source: `packages/core/src/schemas.ts` — `CustomerReferenceSchema`, `PaymentLinkCustomerDataSchema`

---

### MEDIUM Mixing `amount_in_cents` and `percentage` in a single `Tax` object

Wrong:

```typescript
taxes: [
  { type: 'VAT', amount_in_cents: 190_000, percentage: 19 }, // invalid — pick one
]
```

Correct:

```typescript
// TaxByPercentage: use percentage (integer 1–50)
taxes: [{ type: 'VAT', percentage: 19 }]

// TaxByAmount: use amount_in_cents
taxes: [{ type: 'VAT', amount_in_cents: 190_000 }]

// Both tax types in the same link
taxes: [
  { type: 'VAT', percentage: 19 },
  { type: 'CONSUMPTION', amount_in_cents: 50_000 },
]
```

`Tax` is a discriminated union — `TaxByAmount` and `TaxByPercentage` are mutually exclusive shapes. Providing both fields in one object fails Zod validation.

Source: `packages/core/src/schemas.ts` — `TaxSchema`

---

### HIGH Not checking the error tuple before reading data

Wrong:

```typescript
const [, link] = await wompi.paymentLinks.createPaymentLink(input);
return { linkId: link.id }; // TypeError if validation failed or key missing
```

Correct:

```typescript
const [error, link] = await wompi.paymentLinks.createPaymentLink(input);
if (error) {
  return { error: error.message };
}
return { linkId: link.id };
```

Source: `packages/core/src/schemas.ts`

## See also

- `wompi-client-setup/SKILL.md` — key types and error-tuple pattern
