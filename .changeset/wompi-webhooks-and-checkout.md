---
"@pulgueta/wompi": minor
---

Add webhook event verification and Web Checkout URL building to `@pulgueta/wompi/server`, the two server-side primitives a payments integration needs beyond raw API calls:

- `verifyWebhookEvent(payload, { eventsKey })` — parses and authenticates an event Wompi POSTs to your Events URL. It recomputes the SHA-256 checksum from `signature.properties` + `timestamp` + your events secret and compares it in constant time. Returns the SDK's usual `Result` tuple.
- `computeEventChecksum(event, eventsKey)` — the low-level checksum, exposed for custom flows.
- `isTransactionUpdatedEvent(event)` — type guard narrowing a verified event to a fully-typed `transaction.updated` payload.
- `buildCheckoutUrl(options)` — builds a `https://checkout.wompi.co/p/?…` Web Checkout redirect URL, computing the integrity signature for you (or accepting a precomputed one), with support for redirect URL, expiration, customer data, shipping collection and taxes.

`@pulgueta/wompi/schemas` now ships the matching schemas and types: `WebhookEventSchema`, `TransactionUpdatedEventSchema`, `NequiTokenUpdatedEventSchema`, `WebhookSignatureSchema`, their inferred types, and a new `WompiWebhookVerificationError` (discriminant `type: "WEBHOOK_VERIFICATION_ERROR"`).

`CreateTransactionInputSchema` now accepts `payment_method` and `payment_source_id` **together** (previously exactly one was required). Charging a saved card source requires both — Wompi rejects source-only charges with "No se especificó el número de cuotas (installments)" — so the exactly-one refine became at-least-one, and `TransactionPaymentMethodSchema` gained an optional `installments` field. Inputs that passed validation before still do; inputs combining both fields are no longer rejected.

These primitives power the new `@pulgueta/wompi-convex` component, but work in any runtime with Web Crypto (Node 20+, edge runtimes, Convex).
