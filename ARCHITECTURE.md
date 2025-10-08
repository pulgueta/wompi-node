# Architecture Documentation

## Overview

The Wompi SDK monorepo is designed following modern best practices for TypeScript SDKs, inspired by the Resend SDK's elegant architecture.

## Design Principles

### 1. **Resend-Inspired API Design**

The SDK follows the Resend SDK pattern for its clean and intuitive API:

```typescript
// Resend pattern
const resend = new Resend('api_key');
await resend.emails.send({...});

// Wompi pattern (similar structure)
const wompi = new Wompi({ publicKey: 'key' });
await wompi.transactions.create({...});
```

### 2. **Resource-Based Organization**

Instead of a flat API, operations are organized by resource:

```
Wompi
├── merchants      (Merchant operations)
├── transactions   (Transaction management)
├── pse           (PSE/bank transfers)
├── paymentSources (Card tokenization & saved cards)
├── paymentLinks   (Payment links)
└── events        (Webhooks & signatures)
```

### 3. **Type Safety First**

- All API responses are fully typed
- No `any` types in public API
- Discriminated unions for payment methods
- Template literal types for date formats

### 4. **Environment Awareness**

```typescript
const wompi = new Wompi({
  publicKey: 'pub_test_...',
  environment: 'sandbox' // or 'production'
});
```

Base URLs automatically switch based on environment.

## Core Package Architecture

### Class Hierarchy

```
BaseResource (abstract)
├── Merchants
├── Transactions
├── PSE
├── PaymentSources
├── PaymentLinks
└── Events
```

### BaseResource

The foundation for all API resources:

```typescript
abstract class BaseResource {
  protected readonly baseUrl: string;
  
  protected async request<T>(method, endpoint, options): Promise<T>
  protected get<T>(endpoint, headers?, searchParams?): Promise<T>
  protected post<T>(endpoint, body?, headers?): Promise<T>
  protected patch<T>(endpoint, body?, headers?): Promise<T>
  protected delete<T>(endpoint, headers?): Promise<T>
}
```

**Responsibilities:**
- HTTP request handling
- Error transformation
- Response parsing
- Header management
- Query parameter building

### Resource Modules

Each resource module extends `BaseResource` and implements specific domain logic:

#### Example: Transactions

```typescript
class Transactions extends BaseResource {
  private readonly publicKey: string;
  private readonly privateKey?: string;

  async getById(id: string): Promise<WompiResponse<TransactionData>>
  async list(params?: GetTransactionsParams): Promise<WompiResponse<TransactionData[]>>
  async create(params: CreateTransactionParams): Promise<WompiResponse<TransactionData>>
}
```

### Error Handling

Custom `WompiError` class provides rich error information:

```typescript
class WompiError extends Error {
  statusCode: number;
  type?: string;
  reason?: string;
}
```

All API errors are caught and transformed into `WompiError` instances.

### Type System

#### Response Wrapper

All API responses follow this structure:

```typescript
interface WompiResponse<T> {
  data: T;
  meta: Record<string, unknown>;
}
```

#### Discriminated Unions

Payment methods use discriminated unions:

```typescript
type CreatePaymentSourceParams = 
  | CreateCardSourceParams 
  | CreateNequiSourceParams;

interface CreateCardSourceParams {
  type: 'CARD';
  token: string;
  // ...
}

interface CreateNequiSourceParams {
  type: 'NEQUI';
  phone_number: string;
}
```

## React Package Architecture

### Context-Based State

```typescript
<WompiProvider config={...}>
  <App />
</WompiProvider>
```

The provider creates a single Wompi instance and shares it via context.

### Hook Pattern

Each hook follows this pattern:

```typescript
function useWompiTransaction() {
  const { wompi } = useWompiContext();
  const [state, setState] = useState(...);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const operation = useCallback(async (...) => {
    setLoading(true);
    try {
      const result = await wompi.transactions.operation(...);
      setState(result);
      return result;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  return { state, loading, error, operation };
}
```

**Features:**
- Automatic loading states
- Error handling
- Memoized callbacks
- Type-safe returns

### Auto-Fetch Pattern

Some hooks support auto-fetching:

```typescript
function useWompiMerchant(autoFetch = true) {
  // Automatically fetches on mount if autoFetch is true
  useEffect(() => {
    if (autoFetch) {
      fetchMerchant();
    }
  }, [autoFetch, fetchMerchant]);
}
```

## Monorepo Structure

### Turborepo Configuration

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    }
  }
}
```

**Benefits:**
- Parallel builds when possible
- Dependency-aware task execution
- Smart caching
- Remote caching support

### Package Dependencies

```
@pulgueta/wompi (core)
    ↑
    |
@pulgueta/wompi-react (depends on core)
```

React package depends on core package via workspace protocol:

```json
{
  "dependencies": {
    "@pulgueta/wompi": "workspace:*"
  }
}
```

### Build Pipeline

1. **Core Package** builds first
2. **React Package** builds after (depends on core types)
3. **Apps** build last (depend on packages)

## Security Architecture

### API Key Management

```typescript
class Wompi {
  readonly #publicKey: string;      // Client-safe
  readonly #privateKey?: string;    // Server-only
  readonly #integritySecret?: string;
  readonly #eventsSecret?: string;
}
```

Private fields ensure keys can't be accessed externally.

### Signature Verification

#### Integrity Signatures

For transaction creation:

```typescript
async generateIntegritySignature(
  reference: string,
  amountInCents: number,
  integritySecret: string
): Promise<string> {
  const str = `${reference}${amountInCents}COP${integritySecret}`;
  // SHA-256 hash
  return hash;
}
```

#### Webhook Signatures

```typescript
async verifySignature(
  event: WebhookEvent,
  signature: string
): Promise<boolean> {
  const { checksum, properties } = event.signature;
  const concatenated = properties
    .map(prop => getNestedValue(event, prop))
    .join('');
  const expected = hash(`${concatenated}${timestamp}${secret}`);
  return expected === checksum;
}
```

## Extension Points

### Adding New Resources

1. Create new resource class extending `BaseResource`
2. Add to Wompi constructor
3. Export types from index
4. Create corresponding React hook

Example:

```typescript
// 1. Create resource
class Subscriptions extends BaseResource {
  async list() { /* ... */ }
  async create() { /* ... */ }
}

// 2. Add to Wompi
class Wompi {
  readonly subscriptions: Subscriptions;
  
  constructor(options) {
    this.subscriptions = new Subscriptions(this.#baseUrl, this.#privateKey);
  }
}

// 3. Create React hook
function useWompiSubscription() {
  const { wompi } = useWompiContext();
  // ...
}
```

## Performance Considerations

### Bundle Size Optimization

- Tree-shaking enabled via ESM
- Minification in production
- No unnecessary dependencies
- Peer dependencies for React

### Request Optimization

- Single Wompi instance per app
- Memoized React callbacks
- Automatic request deduplication via React hooks

### Type Performance

- No complex conditional types
- Minimal type inference
- Direct type annotations where possible

## Testing Strategy

### Unit Tests

Test individual resource methods:

```typescript
describe('Transactions', () => {
  it('should create transaction', async () => {
    const wompi = new Wompi({ publicKey: 'test' });
    // Mock fetch
    const result = await wompi.transactions.create({...});
    expect(result).toBeDefined();
  });
});
```

### Integration Tests

Test React hooks with React Testing Library:

```typescript
renderHook(() => useWompiTransaction(), {
  wrapper: ({ children }) => (
    <WompiProvider config={...}>{children}</WompiProvider>
  )
});
```

## Migration from Old Structure

### Old Pattern

```typescript
// Old: Nested client structure
import { WompiClient } from '@pulgueta/wompi';
const client = new WompiClient({
  publicKey: 'key',
  publicEventsKey: 'key',
  eventsUrl: 'url'
});
await client.transactions.getTransaction(id);
```

### New Pattern

```typescript
// New: Flat, Resend-like structure
import { Wompi } from '@pulgueta/wompi';
const wompi = new Wompi({
  publicKey: 'key',
  eventsSecret: 'secret'
});
await wompi.transactions.getById(id);
```

## Deployment & Publishing

### Build Process

```bash
# 1. Clean builds
turbo clean

# 2. Install dependencies
pnpm install

# 3. Build all packages
turbo build

# 4. Run tests
turbo test

# 5. Create changeset
pnpm changeset

# 6. Publish
pnpm release
```

### Versioning Strategy

- Semantic versioning (semver)
- Changesets for version management
- Automated changelog generation
- Independent package versions

## Future Enhancements

1. **Retry Logic** - Automatic retry for failed requests
2. **Rate Limiting** - Built-in rate limit handling
3. **Offline Support** - Queue requests when offline
4. **Streaming** - Support for streaming responses
5. **GraphQL** - If Wompi adds GraphQL support
6. **React Native** - Mobile-specific optimizations

## Conclusion

This architecture provides:

- ✅ Excellent developer experience (Resend-inspired)
- ✅ Full type safety
- ✅ Scalable structure
- ✅ Easy to extend
- ✅ Production-ready
- ✅ Framework-agnostic core with framework-specific wrappers
