# @pulgueta/wompi-convex

Subscriptions and product checkouts for [Wompi](https://wompi.co) on
[Convex](https://convex.dev).

Wompi has no products, subscriptions, or billing cycles — it gives you
transactions, tokenized cards, and payment sources. This component supplies the
missing billing engine on top of [`@pulgueta/wompi`](https://npmjs.com/package/@pulgueta/wompi),
with the schema conventions you know from Stripe/Polar/Paddle:

- **One-time checkouts** through Wompi Web Checkout (signed redirect URLs).
- **Subscriptions on saved cards**: trials, renewals, dunning retries,
  cancel-at-period-end, plan changes — computed by the component, charged
  through the Wompi API.
- **Webhooks** with checksum verification, replay dedupe, and amount guards.
- **Real-time state**: every payment and subscription is a Convex document;
  your UI updates the moment a webhook (or the billing cron) lands.
- **Self-healing**: stale pending payments are reconciled against the Wompi
  API, so the system converges even if a webhook never arrives.

All Wompi API calls and secrets stay in **your app's environment**; the
component stores only billing state. Card data never touches your backend —
tokenization happens browser → Wompi with your public key.

```sh
npm install @pulgueta/wompi-convex @pulgueta/wompi
```

## Wiring (four small files)

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import wompi from "@pulgueta/wompi-convex/convex.config.js";

const app = defineApp();
app.use(wompi);
export default app;
```

```sh
npx convex env set WOMPI_PUBLIC_KEY pub_test_...
npx convex env set WOMPI_PRIVATE_KEY prv_test_...
npx convex env set WOMPI_EVENTS_KEY test_events_...
npx convex env set WOMPI_INTEGRITY_KEY test_integrity_...
```

```ts
// convex/wompi.ts
import { Wompi } from "@pulgueta/wompi-convex";
import { components } from "./_generated/api";

export const wompi = new Wompi(components.wompi, {
  // Bridge to your auth. Throw if there is no user.
  getUserInfo: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return { userId: identity.tokenIdentifier, email: identity.email! };
  },
  // Your catalog — Wompi has no product API, the component owns it.
  products: [
    { key: "tee", name: "Camiseta", type: "one_time", amountInCents: 8_990_000 },
    {
      key: "pro",
      name: "Pro",
      type: "subscription",
      amountInCents: 2_990_000,
      interval: "month",
      trialDays: 7,
    },
  ],
});

// Re-export the prebuilt public API. Identity always comes from getUserInfo.
export const {
  getConfig,
  listProducts,
  getCurrentSubscription,
  listSubscriptions,
  listPayments,
  getPayment,
  checkout,
  confirmTransaction,
  subscribe,
  cancelSubscription,
  resumeSubscription,
  changeSubscription,
} = wompi.api();
```

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { wompi } from "./wompi";

const http = httpRouter();
wompi.registerRoutes(http); // POST /wompi/webhook
export default http;
```

```ts
// convex/crons.ts — the billing engine's heartbeat
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("wompi billing", { minutes: 15 }, internal.billing.run, {});
export default crons;

// convex/billing.ts
import { wompi } from "./wompi";
export const run = wompi.billing();
```

Seed the catalog once (`wompi.syncProducts(ctx)` from any mutation, or a small
internal mutation you `npx convex run`). In the Wompi dashboard, point the
sandbox "Eventos" URL at `https://<deployment>.convex.site/wompi/webhook`.

## One-time checkout

```tsx
const checkout = useAction(api.wompi.checkout);

const buy = async () => {
  const { url } = await checkout({
    productKey: "tee",
    redirectUrl: window.location.origin,
  });
  window.location.href = url; // Wompi Web Checkout
};
```

The action creates a pending `payments` row with a unique reference, signs the
amount with your integrity key, and returns the redirect URL. Wompi sends the
customer back with `?id=<transactionId>` — confirm it for instant feedback
(webhooks resolve it anyway):

```tsx
const confirm = useAction(api.wompi.confirmTransaction);

useEffect(() => {
  const id = new URLSearchParams(location.search).get("id");
  if (id) void confirm({ transactionId: id });
}, []);
```

`confirmTransaction` fetches the transaction from the Wompi API and runs it
through the same idempotent state machine webhooks use — safe to call any
number of times, from anywhere.

## Subscriptions

Tokenize in the browser (public key, PCI-friendly), subscribe in one action:

```tsx
import { useWompiTokenizer } from "@pulgueta/wompi-convex/react";

const { tokenizeCard, acceptancePermalink, ready } = useWompiTokenizer(
  api.wompi.getConfig,
);
const subscribe = useAction(api.wompi.subscribe);

const onSubmit = async (card) => {
  const token = await tokenizeCard(card); // browser → Wompi, never your server
  await subscribe({
    productKey: "pro",
    token: token.id,
    paymentMethod: { brand: token.brand, lastFour: token.last_four },
  });
};
```

`subscribe` creates the Wompi payment source (with a fresh merchant acceptance
token), inserts the subscription, and charges the first period — polling
briefly so the common sandbox/production case resolves before the action
returns. Trials skip the initial charge and convert automatically when they
end.

Subscription state is a reactive query:

```tsx
const subscription = useQuery(api.wompi.getCurrentSubscription, {});
// status: "incomplete" | "trialing" | "active" | "past_due" | "unpaid" | "canceled"
const isEntitled = ["active", "trialing", "past_due"].includes(
  subscription?.status ?? "",
);
```

Server-side gating uses the same call through the instance:

```ts
const subscription = await wompi.getCurrentSubscription(ctx, { userId });
```

## How billing works

Wompi has no subscription engine, so the component is one:

1. Every subscription carries `nextChargeAt`. The cron's `claimDue` mutation
   atomically claims everything due — renewals, trial conversions, dunning
   retries — and finalizes cancel-at-period-end subscriptions (never charging
   them).
2. Each claim creates a pending payment with a **deterministic reference**
   (`wmps_<subscription>_<period>_<attempt>`) and a lease. Wompi enforces
   reference uniqueness, so a crashed run can never double-charge: the retry
   either reuses the pending row or hits Wompi's duplicate-reference error and
   reconciles the existing transaction instead.
3. Charges run against the saved payment source
   (`payment_source_id` + `payment_method.installments`). Results — from the
   charge response, a webhook, or redirect confirmation — all flow through one
   idempotent `applyTransaction` state machine.
4. Failed renewals walk a dunning ladder (default retries at +1d, +2d, +4d;
   `past_due` keeps access as grace). Exhausted dunning marks the subscription
   `unpaid` (or `canceled`, your choice). Price snapshots are taken at
   subscribe time; catalog price changes only affect new subscribers. Plan
   changes apply at the next renewal, without proration.
5. The same cron sweeps stale pending payments: ones with a transaction id are
   reconciled against the API; abandoned checkouts expire after ~26h.

Defaults are tunable:

```ts
new Wompi(components.wompi, {
  getUserInfo,
  billing: {
    maxRetries: 3,
    retryScheduleMs: [86_400_000, 172_800_000, 345_600_000],
    onExhausted: "mark_unpaid", // or "cancel"
  },
  events: {
    onSubscriptionChange: async (ctx, subscription) => {
      // grant/revoke entitlements, send emails, ...
    },
    onPaymentChange: async (ctx, payment) => {},
  },
});
```

Callbacks fire exactly once per state change, whether the change arrived via
webhook, cron, or confirmation.

## Security model

- Secrets live in Convex environment variables, read app-side by the `Wompi`
  class. The component's tables never store keys.
- Webhooks are authenticated with Wompi's checksum (SHA-256 over the signed
  properties + timestamp + events secret, constant-time compare) via
  `verifyWebhookEvent` from `@pulgueta/wompi/server`. Invalid signatures get a
  403; replays are deduplicated by checksum.
- `applyTransaction` enforces amount/currency equality against the payment
  row, so a transaction crafted against your public key with a reused
  reference and a 1-cent amount grants nothing.
- Component functions are only callable from your server functions; everything
  in `api()` resolves identity through `getUserInfo`, never from client args.

## Tables

| Table | Purpose |
| --- | --- |
| `customers` | Your users in the billing domain (`userId` ↔ email). |
| `products` | The catalog you define (`one_time` or `subscription` with interval/trial). |
| `paymentSources` | Saved Wompi payment sources (brand/last four for display). |
| `subscriptions` | The state machine: status, period, `nextChargeAt`, dunning counters. |
| `payments` | One row per charge attempt, keyed by unique Wompi reference. |
| `webhookEvents` | Verified deliveries, deduped by checksum, pruned by the cron. |

## Example app

[`example/`](./example) is a live demo storefront (Vite + React, es-CO):
one-time checkout, card subscription with sandbox test cards
(4242… approves, 4111… declines), a renewal/dunning simulator, and a realtime
payments timeline.

```sh
npm i
npm run dev            # convex dev + component rebuild watcher
npm run dev:frontend   # vite
npx convex run dev:seed
```

## Current limitations

- Cards only for subscriptions today. Nequi sources are accepted but
  `nequi_token.updated` events are recorded without activating the source.
- No proration on plan changes (they apply at the next renewal).
- Refunds/voids update payment rows and surface a note, but never mutate
  subscription periods — handle refund policy in `onPaymentChange`.

## License

Apache-2.0
