# @pulgueta/wompi

The official Wompi SDK for Node.js and browser environments. Process payments in Colombia with ease.

## Installation

```bash
npm install @pulgueta/wompi
# or
pnpm add @pulgueta/wompi
# or
yarn add @pulgueta/wompi
```

## Quick Start

```typescript
import { Wompi } from '@pulgueta/wompi';

const wompi = new Wompi({
  publicKey: 'pub_test_...',
  privateKey: 'prv_test_...', // Optional, required for creating transactions
  environment: 'sandbox' // or 'production'
});

// Get merchant information
const merchant = await wompi.merchants.get();

// Get a transaction
const transaction = await wompi.transactions.get('txn_123');

// Create a transaction (requires private key)
const newTransaction = await wompi.transactions.create({
  amount_in_cents: 5000000,
  currency: 'COP',
  customer_email: 'customer@example.com',
  payment_method: {
    type: 'CARD',
    token: 'tok_...',
    installments: 1
  },
  reference: 'ORDER-123'
});
```

## Features

### 🏦 Merchants

Get merchant information and acceptance tokens:

```typescript
const merchant = await wompi.merchants.get();
const acceptanceToken = await wompi.merchants.getAcceptanceToken();
```

### 💳 Transactions

Manage payment transactions:

```typescript
// Get a single transaction
const transaction = await wompi.transactions.get('txn_id');

// List transactions with filters
const transactions = await wompi.transactions.list({
  from_date: '2024-01-01',
  until_date: '2024-12-31',
  status: 'APPROVED',
  page: 1,
  page_size: 20
});

// Create a transaction
const transaction = await wompi.transactions.create({
  amount_in_cents: 5000000,
  currency: 'COP',
  customer_email: 'customer@example.com',
  payment_method: {
    type: 'CARD',
    token: 'tok_...'
  },
  reference: 'ORDER-123'
});
```

### 🏧 PSE (Bank Transfers)

Get available financial institutions for PSE payments:

```typescript
const institutions = await wompi.pse.getFinancialInstitutions();
```

### 💾 Payment Sources

Tokenize and save payment methods:

```typescript
// Tokenize a card
const token = await wompi.paymentSources.tokenizeCard({
  number: '4242424242424242',
  cvc: '123',
  exp_month: '12',
  exp_year: '2025',
  card_holder: 'John Doe'
});

// Create a payment source
const paymentSource = await wompi.paymentSources.create({
  type: 'CARD',
  token: token.data.id,
  customer_email: 'customer@example.com',
  acceptance_token: 'acceptance_token_here'
});

// Get payment source
const source = await wompi.paymentSources.get('src_123');

// Delete payment source
await wompi.paymentSources.delete('src_123');
```

### 🔗 Payment Links

Create and manage payment links:

```typescript
// Create a payment link
const link = await wompi.paymentLinks.create({
  name: 'Product Payment',
  description: 'Payment for awesome product',
  single_use: true,
  currency: 'COP',
  amount_in_cents: 5000000
});

// Get payment link
const paymentLink = await wompi.paymentLinks.get('link_id');

// Update payment link
const updated = await wompi.paymentLinks.update('link_id', {
  name: 'Updated Name',
  description: 'Updated description'
});

// Deactivate/Activate payment link
await wompi.paymentLinks.deactivate('link_id');
await wompi.paymentLinks.activate('link_id');
```

### 🔐 Events & Webhooks

Verify webhook signatures and generate integrity signatures:

```typescript
// Generate integrity signature for a transaction
const signature = await wompi.getIntegritySignature('ORDER-123', 5000000);

// Verify webhook event
const event = await wompi.events.constructEvent(
  webhookPayload,
  signatureFromHeaders
);

// Manual verification
const isValid = await wompi.events.verifySignature(event, signature);
```

## Configuration Options

```typescript
interface WompiOptions {
  publicKey: string;        // Required: Your public API key
  privateKey?: string;      // Optional: Required for creating transactions
  integritySecret?: string; // Optional: For integrity signature generation
  eventsSecret?: string;    // Optional: For webhook signature verification
  environment?: 'production' | 'sandbox'; // Default: 'production'
}
```

## Error Handling

The SDK throws `WompiError` for API errors:

```typescript
import { WompiError } from '@pulgueta/wompi';

try {
  const transaction = await wompi.transactions.get('invalid_id');
} catch (error) {
  if (error instanceof WompiError) {
    console.error('Status:', error.statusCode);
    console.error('Type:', error.type);
    console.error('Message:', error.message);
  }
}
```

## TypeScript Support

This package is written in TypeScript and provides comprehensive type definitions for all API methods and responses.

## Related Packages

- [@pulgueta/wompi-react](https://www.npmjs.com/package/@pulgueta/wompi-react) - React hooks for Wompi

## License

MIT
