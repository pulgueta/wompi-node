---
"@pulgueta/wompi": minor
---

Add a typed error for gateway and availability failures.

A `502`, `503` or `504` response, or a `5xx` response with a body that is not
JSON (an HTML error page), now returns a `WompiServiceUnavailableError`. It has
`type: "SERVICE_UNAVAILABLE_ERROR"`, `statusCode` and `retryable: true`.

The new `isGatewayError(error)` guard from `@pulgueta/wompi/schemas` is true for
this error, and for a `WompiRequestError` or `WompiPayoutApiError` with a `502`,
`503` or `504` status code.

`WompiServiceUnavailableError` extends `WompiRequestError`, so code that reads
`statusCode` from a `WompiRequestError` continues to operate. A structured
Payouts API error stays a `WompiPayoutApiError`.
