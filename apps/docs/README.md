# Wompi SDK documentation

This app uses [Blume](https://useblume.dev). Documentation lives in `content/`, interactive examples in `islands/`, and their server-only endpoints in `pages/api/examples/`.

```sh
pnpm --filter docs dev
```

The live sandbox examples use credentials owned by this deployment. Set the following variables in `.env.local` for local development and in the deployment environment for production:

```dotenv
WOMPI_PUBLIC_KEY=pub_test_...
WOMPI_PRIVATE_KEY=prv_test_...
WOMPI_INTEGRITY_KEY=test_integrity_...
```

The endpoints return `503` with a configuration message when a required variable is absent. Wompi credentials are read only by server routes and are never included in browser assets or responses.

Optional Upstash variables enable per-IP rate limiting for the public examples:

```dotenv
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Run the full documentation gate with:

```sh
pnpm --filter docs build
```
