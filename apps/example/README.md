# Wompi checkout and settlement example

This TanStack Start app runs one Colombia sandbox order through both sides of
`@pulgueta/wompi`:

1. create a server-signed Wompi Web Checkout for a COP 49,500 order;
2. verify the transaction returned by Wompi; and
3. settle the COP 40,000 supplier share through a resolved BRE-B key or a bank
   or digital-wallet account.

Checkout integrity and Payouts credentials stay on the server. The browser
receives narrow serializable DTOs and never sees a secret key.

Before creating a payout, the server verifies a signed order proof and fetches
the Wompi transaction again. The transaction must be `APPROVED` and match the
exact reference, COP currency, and amount issued for this browser flow. A
deterministic settlement reference and idempotency key limit the example to one
supplier settlement attempt per checkout transaction.

> This is a local sandbox demo. Its server functions are unauthenticated and
> reject calls outside development mode. The signed order proof protects the
> tunneled payout flow, but it is not a replacement for application
> authorization or durable order/payout persistence in production.

## Setup

Copy the environment template, then add the sandbox keys from the Wompi
dashboard:

```bash
cp apps/example/.env.example apps/example/.env.local
```

- `WOMPI_PUBLIC_KEY` and `WOMPI_INTEGRITY_KEY` come from the regular Payments
  integration.
- `WOMPI_PAYOUTS_API_KEY`, `WOMPI_PAYOUTS_USER_PRINCIPAL_ID`, and
  `WOMPI_PAYOUTS_EVENTS_KEY` come from **Pagos a Terceros**.
- `WOMPI_EXAMPLE_ORIGIN` must be the exact public HTTPS tunnel origin when the
  hosted Checkout needs to return from another browser.

Install and run from the monorepo root:

```bash
pnpm install
pnpm --filter wompi-example dev
```

The app runs at `http://localhost:3000` by default. A public HTTPS tunnel is
needed for the hosted Checkout redirect to return to a remote browser.

## Sandbox data

Approved Web Checkout card:

```text
4242 4242 4242 4242
Any future expiry
Any three-digit CVC
```

The primary BRE-B example uses `@elias123`. Other successful keys include
`ecolon@wompi.com`, `3001234567`, `1020304050`, `B00012345`, and `900123456`.

The bank or wallet alternative loads the live sandbox catalogue. It explicitly
sends the supplier profile's `personType`, legal identity, beneficiary email,
and transaction reference because Wompi's OpenAPI and prose documentation
disagree about which are required. The operator only chooses the institution,
conditional account type, and account or wallet number before a review step.

## Webhook

Configure Payouts events to target:

```text
/api/payouts-webhook
```

The handler verifies the raw body with `WOMPI_PAYOUTS_EVENTS_KEY`, rejects bad
signatures, and logs the ID and status of verified payout events. The example
polls status in the UI; a production application should persist signed webhook
results as its durable source of truth.
