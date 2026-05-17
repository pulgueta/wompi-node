---
"@pulgueta/wompi": major
---

Overhaul the SDK for type-safety and correctness. This is a breaking release.

**Breaking changes**

- `getSignatureKey` now takes an options object — `{ reference, amountInCents, integrityKey, currency?, expirationTime? }` — instead of positional arguments. It hashes `amountInCents` exactly as given (the previous build multiplied it by 100, producing wrong signatures) and throws a `WompiError` when the amount is not a non-negative integer.
- `voidTransaction` resolves to the wrapped void outcome — the voided transaction is nested under `data.transaction` — or to `undefined` for an empty `201`. Code that read the transaction directly off `data` must be updated.

**Fixes & improvements**

- Response schemas are lenient: a successful Wompi response is never reported as a validation error. Non-identity fields are optional, unknown fields pass through, and drift-prone enums (`payment_method_type`, `accepted_payment_methods`, merchant `legal_id_type`) accept any string.
- Empty `2xx` bodies are handled — they resolve to `undefined` instead of failing JSON parsing.
- `PaymentMethodType` gains `BANCOLOMBIA_BNPL`, `DAVIPLATA`, `SU_PLUS` and `CARD_POS`.
- Input validation is tightened: Zod email/URL formats, an `amount_in_cents` ceiling, a positive-integer `payment_source_id`, and a rule requiring exactly one of `payment_method` / `payment_source_id`.
- The `Result` tuple types its error as the full `WompiError` union, so consumers can narrow on `.type` / `.statusCode` without `instanceof`.
- `WompiClient` is re-exported from the package root (`@pulgueta/wompi`).
