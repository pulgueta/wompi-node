# Wompi SDK - Monorepo

A comprehensive TypeScript SDK for the Wompi payment gateway, designed with simplicity, scalability, and type-safety in mind.

## 📦 Packages

### [@pulgueta/wompi](./packages/core)

Core SDK for interacting with the Wompi API in both Node.js and browser environments.

```bash
npm install @pulgueta/wompi
```

**Key Features:**
- 🔐 Complete API coverage (transactions, payment sources, PSE, payment links, webhooks)
- 📘 Full TypeScript support with comprehensive types
- 🔄 Works in Node.js and browser environments
- 🎯 Resend-inspired API design for excellent developer experience
- ✅ Built-in request/response validation
- 🔒 Webhook signature verification

### [@pulgueta/wompi-react](./packages/react)

React hooks and components for seamless Wompi integration in React applications.

```bash
npm install @pulgueta/wompi-react @pulgueta/wompi
```

**Key Features:**
- ⚛️ React 17, 18, and 19 support
- 🪝 Custom hooks for all Wompi operations
- 🎨 Context provider for easy setup
- 📦 Tree-shakeable and optimized
- 🔄 State management included

## 🚀 Quick Start

### Core SDK

```typescript
import { Wompi } from '@pulgueta/wompi';

const wompi = new Wompi({
  publicKey: 'pub_test_...',
  privateKey: 'prv_test_...', // Optional, for private operations
  environment: 'sandbox' // or 'production'
});

// Get merchant info
const merchant = await wompi.merchants.getMerchantInfo();

// Create a transaction
const transaction = await wompi.transactions.create({
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

### React SDK

```tsx
import { WompiProvider, useWompiTransaction } from '@pulgueta/wompi-react';

function App() {
  return (
    <WompiProvider config={{ publicKey: 'pub_test_...', environment: 'sandbox' }}>
      <PaymentForm />
    </WompiProvider>
  );
}

function PaymentForm() {
  const { createTransaction, loading, error } = useWompiTransaction();

  const handlePay = async () => {
    await createTransaction({
      amount_in_cents: 5000000,
      currency: 'COP',
      customer_email: 'customer@example.com',
      payment_method: { type: 'CARD', token: 'tok_...', installments: 1 },
      reference: 'ORDER-123'
    });
  };

  return <button onClick={handlePay} disabled={loading}>Pay Now</button>;
}
```

## 🏗️ Architecture

This monorepo is built with:

- **📦 Turborepo** - High-performance build system
- **⚡ TypeScript** - Full type safety across all packages
- **🔧 tsup** - Fast, zero-config bundling
- **🧪 Vitest** - Lightning-fast unit testing
- **📝 Changesets** - Version management and publishing

### Project Structure

```
wompi-sdk/
├── packages/
│   ├── core/          # @pulgueta/wompi - Core SDK
│   ├── react/         # @pulgueta/wompi-react - React hooks
│   └── ts/            # Shared TypeScript configs
├── apps/
│   └── docs/          # Documentation site
└── examples/          # Usage examples
```

## 🛠️ Development

### Prerequisites

- Node.js >= 18
- pnpm >= 9

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint and format
pnpm lint
pnpm format
```

### Working with Packages

```bash
# Build specific package
pnpm --filter @pulgueta/wompi build

# Add dependency to package
pnpm --filter @pulgueta/wompi add lodash

# Run dev mode
pnpm dev
```

## 📚 API Reference

### Core SDK

#### Merchants
- `getMerchantInfo()` - Get merchant information
- `getAcceptanceToken()` - Get acceptance token for terms

#### Transactions
- `getById(id)` - Get transaction by ID
- `list(params?)` - List transactions with filters
- `create(params)` - Create new transaction

#### Payment Sources
- `tokenizeCard(params)` - Tokenize a credit/debit card
- `create(params)` - Save a payment method
- `getById(id)` - Get payment source
- `remove(id)` - Delete payment source

#### PSE
- `getFinancialInstitutions()` - Get list of banks for PSE

#### Payment Links
- `create(params)` - Create payment link
- `getById(id)` - Get payment link
- `update(id, params)` - Update payment link
- `activate(id)` / `deactivate(id)` - Toggle payment link status

#### Events (Webhooks)
- `generateIntegritySignature(reference, amount, secret)` - Generate integrity hash
- `verifySignature(event, signature)` - Verify webhook signature
- `constructEvent(payload, signature)` - Parse and verify webhook

### React Hooks

- `useWompiMerchant()` - Merchant info and acceptance token
- `useWompiTransaction()` - Transaction operations
- `useWompiPaymentSource()` - Payment source management
- `useWompiPaymentLink()` - Payment link operations
- `useWompiPSE()` - PSE financial institutions

## 🔐 Security

### API Keys

- **Public Key** (`pub_test_...` / `pub_prod_...`) - Safe for client-side use
- **Private Key** (`prv_test_...` / `prv_prod_...`) - Server-side only, never expose
- **Integrity Secret** - For generating transaction signatures
- **Events Secret** - For webhook verification

### Best Practices

1. Never commit API keys to version control
2. Use environment variables for keys
3. Always verify webhook signatures
4. Use HTTPS in production
5. Implement proper error handling

## 🌍 Environments

### Sandbox (Testing)

```typescript
new Wompi({
  publicKey: 'pub_test_...',
  environment: 'sandbox'
})
```

### Production

```typescript
new Wompi({
  publicKey: 'pub_prod_...',
  environment: 'production'
})
```

## 📄 License

MIT © Andrés Rodríguez

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 🔗 Resources

- [Wompi Documentation](https://docs.wompi.co/docs/colombia/inicio-rapido)
- [Wompi API Reference](https://app.swaggerhub.com/apis-docs/waybox/wompi/1.2.0)
- [GitHub Repository](https://github.com/pulgueta/wompi-sdk)

## 📦 Publishing

```bash
# Create a changeset
pnpm changeset

# Version packages
pnpm version

# Build and publish
pnpm release
```

## 💡 Inspiration

This SDK's architecture is inspired by the excellent [Resend SDK](https://github.com/resend/resend-node), prioritizing developer experience and code clarity.

## 🎯 Roadmap

- [ ] Add more comprehensive tests
- [ ] Add example applications
- [ ] Add Vue.js package
- [ ] Add Svelte package
- [ ] Add detailed migration guide
- [ ] Add webhook testing utilities

## 📞 Support

For issues and questions:
- 📧 Email: roariasaf@gmail.com
- 🐛 GitHub Issues: [Create an issue](https://github.com/pulgueta/wompi-sdk/issues)
