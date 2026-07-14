# Developing guide

## Running locally

```sh
npm i
npm run dev
```

## Testing

```sh
npm ci
npm run clean
npm run typecheck
npm run lint
npm run test
```

## Deploying the example backend

Use the package deploy script so the core SDK and component package are built
before Convex bundles the example app:

```sh
pnpm deploy
```
