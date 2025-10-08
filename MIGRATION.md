# Migration Guide

This guide will help you migrate from the old Wompi SDK structure to the new Resend-inspired architecture.

## Overview of Changes

### Key Improvements

1. **🎯 Better API Design** - Resend-inspired, more intuitive structure
2. **📘 Complete TypeScript Support** - Full type coverage
3. **⚛️ React Package** - Dedicated hooks for React applications
4. **🔐 Enhanced Security** - Better webhook and signature handling
5. **📦 Improved Bundle** - Tree-shakeable, optimized for size

## Breaking Changes

### 1. Import Path Changes

**Before:**

```typescript
import { WompiClient } from '@pulgueta/wompi/client';
```

**After:**

```typescript
import { Wompi } from '@pulgueta/wompi';
```

### 2. Initialization

**Before:**

```typescript
const client = new WompiClient({
  publicKey: 'pub_test_...',
  publicEventsKey: 'events_key',
  eventsUrl: 'https://...'
});
```

**After:**

```typescript
const wompi = new Wompi({
  publicKey: 'pub_test_...',
  privateKey: 'prv_test_...', // Optional
  integritySecret: 'secret',  // Optional
  eventsSecret: 'secret',     // Optional
  environment: 'sandbox'      // or 'production'
});
```

### 3. Method Name Changes

#### Merchants

**Before:**

```typescript
await client.merchants.authenticate();
```

**After:**

```typescript
await wompi.merchants.getMerchantInfo();
await wompi.merchants.getAcceptanceToken();
```

#### Transactions

**Before:**

```typescript
await client.transactions.getTransaction(id);
await client.transactions.getTransactions(params);
```

**After:**

```typescript
await wompi.transactions.getById(id);
await wompi.transactions.list(params);
await wompi.transactions.create(params);
```

#### PSE

**Before:**

```typescript
await client.pse.getFinantialInstitutions();
```

**After:**

```typescript
await wompi.pse.getFinancialInstitutions();
```

### 4. New Features

#### Payment Sources

```typescript
// Tokenize a card
const token = await wompi.paymentSources.tokenizeCard({
  number: '4242424242424242',
  cvc: '123',
  exp_month: '12',
  exp_year: '2028',
  card_holder: 'John Doe'
});

// Create payment source
const source = await wompi.paymentSources.create({
  type: 'CARD',
  token: token.data.id,
  customer_email: 'customer@example.com',
  acceptance_token: 'token'
});

// Get payment source
await wompi.paymentSources.getById('src_123');

// Delete payment source
await wompi.paymentSources.remove('src_123');
```

#### Payment Links

```typescript
// Create payment link
const link = await wompi.paymentLinks.create({
  name: 'Product Payment',
  description: 'Payment for product',
  single_use: true,
  currency: 'COP',
  amount_in_cents: 5000000
});

// Get payment link
await wompi.paymentLinks.getById('link_123');

// Update payment link
await wompi.paymentLinks.update('link_123', {
  name: 'Updated Name'
});

// Activate/Deactivate
await wompi.paymentLinks.activate('link_123');
await wompi.paymentLinks.deactivate('link_123');
```

#### Events & Webhooks

```typescript
// Generate integrity signature
const signature = await wompi.getIntegritySignature(
  'ORDER-123',
  5000000
);

// Verify webhook
const event = await wompi.events.constructEvent(
  webhookPayload,
  signatureFromHeaders
);

// Manual verification
const isValid = await wompi.events.verifySignature(
  event,
  signature
);
```

## Migration Steps

### Step 1: Update Dependencies

```bash
# Remove old package (if different)
npm uninstall @pulgueta/wompi

# Install new packages
npm install @pulgueta/wompi@latest

# For React projects
npm install @pulgueta/wompi-react
```

### Step 2: Update Initialization

Replace your old initialization code:

```diff
- import { WompiClient } from '@pulgueta/wompi/client';
+ import { Wompi } from '@pulgueta/wompi';

- const client = new WompiClient({
-   publicKey: process.env.WOMPI_PUBLIC_KEY,
-   publicEventsKey: process.env.WOMPI_EVENTS_KEY,
-   eventsUrl: process.env.WOMPI_EVENTS_URL
- });
+ const wompi = new Wompi({
+   publicKey: process.env.WOMPI_PUBLIC_KEY,
+   privateKey: process.env.WOMPI_PRIVATE_KEY,
+   integritySecret: process.env.WOMPI_INTEGRITY_SECRET,
+   eventsSecret: process.env.WOMPI_EVENTS_SECRET,
+   environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
+ });
```

### Step 3: Update Method Calls

Replace all method calls with the new API:

```diff
// Merchants
- await client.merchants.authenticate();
+ await wompi.merchants.getMerchantInfo();

// Transactions
- await client.transactions.getTransaction(id);
+ await wompi.transactions.getById(id);

- await client.transactions.getTransactions(params);
+ await wompi.transactions.list(params);

// PSE
- await client.pse.getFinantialInstitutions();
+ await wompi.pse.getFinancialInstitutions();
```

### Step 4: Update Types

```diff
- import type { TransactionResponse } from '@pulgueta/wompi/client/transactions/types';
+ import type { TransactionData, WompiResponse } from '@pulgueta/wompi';

- const transaction: TransactionResponse = await client.transactions.getTransaction(id);
+ const transaction: WompiResponse<TransactionData> = await wompi.transactions.getById(id);
+ const data = transaction.data; // Access the actual transaction data
```

### Step 5: Migrate to React Hooks (Optional)

If you're using React, consider using the new hooks package:

**Before (manual implementation):**

```typescript
function PaymentComponent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [transaction, setTransaction] = useState(null);

  const getTransaction = async (id: string) => {
    setLoading(true);
    try {
      const result = await client.transactions.getTransaction(id);
      setTransaction(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (/* ... */);
}
```

**After (using hooks):**

```typescript
import { WompiProvider, useWompiTransaction } from '@pulgueta/wompi-react';

// Wrap app with provider
function App() {
  return (
    <WompiProvider config={{ publicKey: '...', environment: 'sandbox' }}>
      <PaymentComponent />
    </WompiProvider>
  );
}

// Use the hook
function PaymentComponent() {
  const { transaction, loading, error, getTransaction } = useWompiTransaction();

  useEffect(() => {
    getTransaction('txn_123');
  }, []);

  return (/* ... */);
}
```

## Type System Changes

### Response Structure

All API responses now follow a consistent structure:

```typescript
interface WompiResponse<T> {
  data: T;
  meta: Record<string, unknown>;
}
```

**Before:**

```typescript
const result = await client.transactions.getTransaction(id);
console.log(result.data.id); // Direct access
```

**After:**

```typescript
const result = await wompi.transactions.getById(id);
console.log(result.data.id); // Same access pattern
```

### Error Handling

**Before:**

```typescript
try {
  await client.transactions.getTransaction(id);
} catch (error) {
  console.error(error.message);
}
```

**After:**

```typescript
import { WompiError } from '@pulgueta/wompi';

try {
  await wompi.transactions.getById(id);
} catch (error) {
  if (error instanceof WompiError) {
    console.error('Status:', error.statusCode);
    console.error('Type:', error.type);
    console.error('Reason:', error.reason);
    console.error('Message:', error.message);
  }
}
```

## React Migration Examples

### Example 1: Transaction List

**Before:**

```typescript
function TransactionList() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    client.transactions.getTransactions({
      page: 1,
      page_size: 20
    })
      .then(result => setTransactions(result))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;
  return (/* render transactions */);
}
```

**After:**

```typescript
import { useWompiTransaction } from '@pulgueta/wompi-react';

function TransactionList() {
  const { transactions, loading, listTransactions } = useWompiTransaction();

  useEffect(() => {
    listTransactions({ page: 1, page_size: 20 });
  }, []);

  if (loading) return <div>Loading...</div>;
  return (/* render transactions */);
}
```

### Example 2: PSE Bank Selector

**Before:**

```typescript
function BankSelector() {
  const [banks, setBanks] = useState([]);

  useEffect(() => {
    client.pse.getFinantialInstitutions()
      .then(result => setBanks(result.data));
  }, []);

  return (
    <select>
      {banks.map(bank => (
        <option key={bank.financial_institution_code} value={bank.financial_institution_code}>
          {bank.financial_institution_name}
        </option>
      ))}
    </select>
  );
}
```

**After:**

```typescript
import { useWompiPSE } from '@pulgueta/wompi-react';

function BankSelector() {
  const { institutions, loading } = useWompiPSE(); // Auto-fetches on mount

  if (loading) return <div>Loading banks...</div>;

  return (
    <select>
      {institutions?.map(bank => (
        <option key={bank.financial_institution_code} value={bank.financial_institution_code}>
          {bank.financial_institution_name}
        </option>
      ))}
    </select>
  );
}
```

## Environment Variables

Update your environment variables:

```bash
# Old
WOMPI_PUBLIC_KEY=pub_test_...
WOMPI_EVENTS_KEY=events_...
WOMPI_EVENTS_URL=https://...

# New
WOMPI_PUBLIC_KEY=pub_test_...
WOMPI_PRIVATE_KEY=prv_test_...
WOMPI_INTEGRITY_SECRET=test_integrity_...
WOMPI_EVENTS_SECRET=test_events_...
WOMPI_ENVIRONMENT=sandbox
```

## Checklist

Use this checklist to ensure complete migration:

- [ ] Updated package dependencies
- [ ] Changed import statements
- [ ] Updated initialization code
- [ ] Replaced all method calls
- [ ] Updated type imports
- [ ] Updated error handling
- [ ] Migrated to React hooks (if applicable)
- [ ] Updated environment variables
- [ ] Tested all payment flows
- [ ] Tested webhook verification
- [ ] Updated documentation

## Troubleshooting

### Issue: TypeScript errors after migration

**Solution:** Ensure you're importing types from the correct location:

```typescript
import type {
  TransactionData,
  PaymentSourceData,
  WompiResponse
} from '@pulgueta/wompi';
```

### Issue: "Private key required" error

**Solution:** Some operations require a private key:

```typescript
const wompi = new Wompi({
  publicKey: 'pub_test_...',
  privateKey: 'prv_test_...', // Required for creating transactions, payment links
  environment: 'sandbox'
});
```

### Issue: React hooks not working

**Solution:** Ensure you've wrapped your app with `WompiProvider`:

```typescript
import { WompiProvider } from '@pulgueta/wompi-react';

function App() {
  return (
    <WompiProvider config={{ publicKey: '...', environment: 'sandbox' }}>
      <YourApp />
    </WompiProvider>
  );
}
```

## Need Help?

If you encounter issues during migration:

1. Check the [documentation](./README.md)
2. Review the [examples](./examples/)
3. Open an issue on [GitHub](https://github.com/pulgueta/wompi-sdk/issues)
4. Email: roariasaf@gmail.com

## Rollback Plan

If you need to rollback:

```bash
# Install previous version
npm install @pulgueta/wompi@previous-version

# Revert your code changes
git checkout previous-commit
```

We recommend testing the new version in a staging environment before deploying to production.
