# @pulgueta/wompi-react

React hooks and components for seamless Wompi payment integration.

## Installation

```bash
npm install @pulgueta/wompi-react @pulgueta/wompi
# or
pnpm add @pulgueta/wompi-react @pulgueta/wompi
# or
yarn add @pulgueta/wompi-react @pulgueta/wompi
```

## Quick Start

### 1. Wrap your app with WompiProvider

```tsx
import { WompiProvider } from '@pulgueta/wompi-react';

function App() {
  return (
    <WompiProvider 
      config={{
        publicKey: 'pub_test_...',
        environment: 'sandbox'
      }}
    >
      <YourApp />
    </WompiProvider>
  );
}
```

### 2. Use hooks in your components

```tsx
import { useWompiTransaction, useWompiPaymentSource } from '@pulgueta/wompi-react';

function PaymentComponent() {
  const { createTransaction, loading, error } = useWompiTransaction();
  const { tokenizeCard } = useWompiPaymentSource();

  const handlePayment = async (cardData) => {
    // Tokenize the card
    const token = await tokenizeCard({
      number: '4242424242424242',
      cvc: '123',
      exp_month: '12',
      exp_year: '2025',
      card_holder: 'John Doe'
    });

    if (token) {
      // Create transaction
      await createTransaction({
        amount_in_cents: 5000000,
        currency: 'COP',
        customer_email: 'customer@example.com',
        payment_method: {
          type: 'CARD',
          token: token.id,
          installments: 1
        },
        reference: 'ORDER-123'
      });
    }
  };

  return (
    <button onClick={handlePayment} disabled={loading}>
      Pay Now
    </button>
  );
}
```

## Available Hooks

### useWompiTransaction

Manage transactions (get, list, create).

```tsx
const { 
  transaction, 
  transactions, 
  loading, 
  error, 
  getTransaction, 
  listTransactions, 
  createTransaction 
} = useWompiTransaction();
```

### useWompiPaymentSource

Manage payment sources (tokenize, save, retrieve cards).

```tsx
const { 
  paymentSource, 
  tokenizedCard, 
  loading, 
  error, 
  tokenizeCard, 
  createPaymentSource, 
  getPaymentSource, 
  deletePaymentSource 
} = useWompiPaymentSource();
```

### useWompiPaymentLink

Create and manage payment links.

```tsx
const { 
  paymentLink, 
  loading, 
  error, 
  createPaymentLink, 
  getPaymentLink, 
  updatePaymentLink, 
  deactivatePaymentLink 
} = useWompiPaymentLink();
```

### useWompiPSE

Get PSE financial institutions for bank transfers.

```tsx
const { 
  institutions, 
  loading, 
  error, 
  fetchInstitutions 
} = useWompiPSE();
```

### useWompiMerchant

Get merchant information and acceptance token.

```tsx
const { 
  merchant, 
  acceptanceToken, 
  loading, 
  error, 
  fetchMerchant 
} = useWompiMerchant();
```

## TypeScript Support

This package is written in TypeScript and provides full type definitions.

## License

MIT
