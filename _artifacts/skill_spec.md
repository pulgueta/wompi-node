# Skill Specification — @pulgueta/wompi

Generated from: `domain_map.yaml`
Generated at: 2026-05-20

---

## Overview

`@pulgueta/wompi` is a focused, single-purpose SDK for the Wompi payment gateway
(Colombia). It wraps the Wompi REST API with TypeScript types, Zod-validated
inputs/outputs, and an error-first tuple pattern `[error, data]`.

The SDK exposes six resource namespaces (`merchants`, `transactions`, `tokens`,
`paymentSources`, `paymentLinks`, `pse`) and one server utility
(`getSignatureKey`). There are no framework-specific adapters — the SDK is
framework-agnostic and works in any Node.js environment.

---

## Skill List

| # | Name | Slug | Type | Domain |
|---|------|------|------|--------|
| 1 | wompi-client-setup | client-setup | core | payment-processing |
| 2 | wompi-transactions | transactions | core | payment-processing |
| 3 | wompi-payment-sources | payment-sources | core | payment-instruments |
| 4 | wompi-payment-links | payment-links | core | payment-instruments |
| 5 | wompi-go-to-production | go-to-production | lifecycle | payment-processing |
| 6 | wompi-server-integration | server-integration | composition | payment-processing |

---

## Skill Specifications

### 1. wompi-client-setup (core)

**Goal**: Initialize `WompiClient` correctly and understand the error-first tuple
pattern before using any other namespace.

**Scope**:
- Constructor options: `publicKey` (required), `privateKey` (optional),
  `sandbox` (optional, default `false`)
- Error-first tuple: `const [error, data] = await wompi.x.y()`
- `WompiError` and its subclasses: `WompiNotFoundError`, `WompiValidationError`,
  `WompiRequestError`
- Subpath exports: `/client`, `/server`, `/errors`, `/types`, `/schemas`

**Out of scope**: Any specific transaction or payment operation.

**Common mistakes**:
1. Setting `sandbox: true` for production (or forgetting it in development)
2. Missing `privateKey` when calling private endpoints
3. Not checking `error` before accessing `data`
4. Treating the SDK like a throwing library (it never throws on API errors)

---

### 2. wompi-transactions (core)

**Goal**: Execute the full Wompi transaction lifecycle — from acceptance token
through card tokenization, signature computation, and transaction creation.

**Scope**:
- `getMerchant()` → `presigned_acceptance.acceptance_token`
- `tokenizeCard(input)`, `tokenizeNequi(input)`, `getNequiToken(id)`
- `getSignatureKey({ reference, amountInCents, integrityKey, currency?, expirationTime? })`
- `createTransaction(input)` with `payment_method` or `payment_source_id`
- `getTransaction(id)`, `listTransactions(params)` (requires `privateKey`)
- `voidTransaction(id, input?)` — result nested at `data.transaction`
- `pse.getFinancialInstitutions()`

**Out of scope**: Payment sources (covered in `wompi-payment-sources`).

**Common mistakes** (2 are CRITICAL v1→v2 breaks):
1. [CRITICAL] Passing amount already multiplied by 100 — `amountInCents` is
   already in cents; do NOT multiply
2. [CRITICAL] Using positional args (`tokenizeCard(number, cvc, ...)`) — v2
   uses options object (`tokenizeCard({ number, cvc, ... })`)
3. Missing `acceptance_token` in `createTransaction`
4. Using `data.id` from voidTransaction when the shape is `data.transaction.id`
5. Forgetting `integrityKey` env var for `getSignatureKey`
6. Passing `expirationTime` to signature but not to transaction (or vice versa)

---

### 3. wompi-payment-sources (core)

**Goal**: Create reusable CARD or NEQUI payment sources for recurring billing
and use `payment_source_id` in subsequent transactions.

**Scope**:
- `createPaymentSource(input)` — requires `acceptance_token` + `privateKey`
- `getPaymentSource(id)` — requires `privateKey`
- `PaymentSourceStatus`: `AVAILABLE` | `PENDING`
- Using `payment_source_id` in `createTransaction` instead of `payment_method`

**Out of scope**: One-time card transactions without stored payment source.

**Common mistakes**:
1. Omitting `acceptance_token` from `createPaymentSource`
2. Missing `privateKey` — both methods require it
3. Not polling for `AVAILABLE` status before charging (NEQUI sources can be `PENDING`)

---

### 4. wompi-payment-links (core)

**Goal**: Create, retrieve, and manage hosted Wompi payment pages that require no
custom frontend.

**Scope**:
- `createPaymentLink(input)` — requires `privateKey`
- `getPaymentLink(id)` — public, no `privateKey`
- `updatePaymentLink(id, input)` — only `active` boolean can be updated;
  requires `privateKey`
- `Tax` union: `TaxByAmount` (`tax_in_cents`) | `TaxByPercentage` (`tax_percentage`)
- `CustomerReference`: max 2 references; `label` max 24 chars

**Common mistakes**:
1. Attempting to update fields other than `active` — Wompi only allows toggling
2. Exceeding 2 `customer_data` references or 24-char label limit
3. Missing `privateKey` for create/update operations

---

### 5. wompi-go-to-production (lifecycle)

**Goal**: Verify an integration is production-ready with a structured checklist
and a complete end-to-end example.

**Body template**: checklist/audit (not standard Setup→Patterns→Mistakes)

**Checklist items**:
1. Environment variables: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`,
   `WOMPI_INTEGRITY_KEY` — never hardcoded
2. `sandbox: false` (or env-driven) in production
3. `amount_in_cents` is already in cents — no ×100
4. `reference` is unique per transaction
5. Every `[error, data]` tuple is checked before accessing `data`
6. Transaction result persisted to DB before responding to client
7. `WompiError` subclass narrowing in error handlers
8. `integrityKey` included in signature; `expirationTime` consistent between
   signature and transaction
9. `listTransactions` / `voidTransaction` only called with `privateKey` present

**Includes**: Full Hono end-to-end example (client form → server route →
`getMerchant` → `tokenizeCard` → `getSignatureKey` → `createTransaction` → DB
persist → response).

---

### 6. wompi-server-integration (composition)

**Goal**: Wire `@pulgueta/wompi` into a Hono or Elysia backend with Zod schema
validation, DB persistence, and typed error responses.

**Requires**: `wompi-client-setup`, `wompi-transactions`

**Scope**:
- Importing Zod schemas from `@pulgueta/wompi/schemas` for route-level validation
- Processing a transaction inside a Hono or Elysia handler
- Persisting transaction result to a database (ORM-agnostic pattern)
- Mapping `WompiError` subclasses to HTTP status codes
- Returning typed error responses

**Common mistakes**:
1. Validating request body with a hand-written schema instead of
   `@pulgueta/wompi/schemas`
2. Responding to the client before persisting the transaction
3. Swallowing `WompiError` without mapping to HTTP status

---

## Structure Decision

**Flat** — all 6 skills map 1:1 to developer tasks with no natural hierarchy.
No router skill needed (threshold: 15+ skills).
No framework adapters (library is framework-agnostic; Hono/Elysia examples are
illustrative, not prescriptive).
