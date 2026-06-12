# Tienda Wompi — example app

Live demo storefront for `@pulgueta/wompi-convex`: one-time checkouts through
Wompi Web Checkout, card subscriptions with saved payment sources, a
renewal/dunning simulator, and a realtime payments timeline.

## Run it

From `packages/convex-component`:

```sh
npm i
npm run dev            # convex dev (deploys example/convex) + component rebuild watcher
npm run dev:frontend   # vite on http://localhost:5173
```

Set the sandbox keys on the dev deployment and seed the catalog:

```sh
npx convex env set WOMPI_PUBLIC_KEY pub_test_...
npx convex env set WOMPI_PRIVATE_KEY prv_test_...
npx convex env set WOMPI_EVENTS_KEY test_events_...
npx convex env set WOMPI_INTEGRITY_KEY test_integrity_...
npx convex run dev:seed
```

Optional: point the Wompi dashboard's sandbox "Eventos" URL at
`https://<deployment>.convex.site/wompi/webhook`. Without it the demo still
works — redirect confirmation and the billing sweep reconcile everything.

## Sandbox test cards

| Card | Result |
| --- | --- |
| `4242 4242 4242 4242` | Approved |
| `4111 1111 1111 1111` | Declined |

Any future expiry and any 3-digit CVC.

## What to try

1. Buy a product — you'll be redirected to Wompi's checkout and back; the
   banner confirms the payment and the timeline updates live.
2. Subscribe to a plan with the 4111 card: the issuer declines, the attempt is
   recorded, and the form explains. Retry with 4242 — the same subscription is
   reused and activates.
3. "⏩ Simular renovación" advances `nextChargeAt` and runs the billing cycle:
   a real sandbox charge against the saved card, period extended, new row in
   the timeline.
4. Cancel and simulate again: the cancellation finalizes at period end with
   zero charges.

The demo signs everyone in as a shared demo user (see `getUserInfo` in
[`convex/wompi.ts`](./convex/wompi.ts)) so it runs without an auth provider.
In production, resolve the real identity there and throw when missing.
