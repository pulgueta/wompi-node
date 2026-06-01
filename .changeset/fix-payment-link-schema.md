---
"@pulgueta/wompi": patch
---

fix: accept `null` values in payment-link response fields (`sku`, `expires_at`, `redirect_url`, `image_url`, `customer_data`)

feat: SDK now returns `checkout_url` on payment-link responses, so callers don't have to build the URL manually
