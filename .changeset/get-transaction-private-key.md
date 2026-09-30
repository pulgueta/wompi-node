---
"@pulgueta/wompi": patch
---

Send the private key on `getTransaction`, as the Wompi API now requires.

Wompi accepts `GET /transactions/{id}` only with the private key. A lookup
without it returns `404 Not Found`, so the SDK reported a `WompiNotFoundError`
for transactions that exist.

`getTransaction` now sends `Authorization: Bearer <privateKey>`. A client
without `privateKey` gets `[WompiError("Private key is required for this
operation"), null]` and sends no request. Call `getTransaction` from your
server.
