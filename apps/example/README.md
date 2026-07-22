# Wompi payouts example

This TanStack Start app demonstrates the sandbox payout features in
`@pulgueta/wompi`:

- list origin accounts and their balances;
- resolve a masked BRE-B beneficiary before sending funds;
- create one BRE-B or bank-account dispersion;
- refresh the resulting payout status; and
- verify and narrow signed payout webhook events on the server.

All Wompi credentials and SDK calls stay on the server. The browser only calls
TanStack Start server functions that return small serializable DTOs.

> This is a local sandbox demo. Its payout server functions intentionally have
> no application authentication and reject calls outside development mode. Do
> not remove that guard or deploy it publicly without adding authorization for
> every payout server function.

## Setup

From the monorepo root, copy the environment template and add sandbox Payouts
credentials from the Wompi dashboard:

```bash
cp apps/example/.env.example apps/example/.env
```

Then install the workspace and start the example:

```bash
pnpm install
pnpm turbo run dev --filter=wompi-example
```

The app runs at `http://localhost:3000` by default.

## Sandbox BRE-B keys

Successful resolutions:

| Key | Key type | Financial entity |
| --- | --- | --- |
| `ecolon@wompi.com` | `MAIL` | BANCOLOMBIA |
| `3001234567` | `PHONE` | BANCO POPULAR |
| `1020304050` | `IDENTIFICATION` | BANCO POPULAR |
| `@elias123` | `ALPHANUMERIC` | BANCO DAVIVIENDA |

Error simulations:

| Key | Result |
| --- | --- |
| `noexiste@test.com` | `EXC_034` — key not found |
| `inactiva@test.com` | `EXC_035` — inactive key |
| `timeout@test.com` | `EXC_037` — resolution timeout |
| `error@test.com` | `EXC_036` — service unavailable |

## Webhook

Configure the Payouts events URL to target:

```text
/api/payouts-webhook
```

The handler verifies the raw request body with
`WOMPI_PAYOUTS_EVENTS_KEY`, rejects invalid signatures with HTTP 403, and logs
the ID and status of verified `payout.updated` and `transaction.updated` events.
