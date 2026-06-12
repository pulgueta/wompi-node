# PRODUCT.md

## Register

Product. The UI surfaces in this repo are developer-facing demos and docs for
the `@pulgueta/wompi` SDK and the `@pulgueta/wompi-convex` component. Design
serves the task: a developer evaluating whether the payments integration
actually works.

## Users & Purpose

Colombian (and LatAm) developers integrating Wompi payments into their apps.
They arrive from the README or docs site, run the example locally against the
Wompi sandbox, and decide in minutes whether the SDK/component is trustworthy.
The primary surface is `packages/convex-component/example`: a tiny demo
storefront exercising one-time checkouts, card subscriptions, renewals and
dunning — all reactive via Convex.

## Brand personality

Code-first, concrete, calm. Three words: precise, warm, unexaggerated. The
repo's voice rule: show the working code, never market it. Spanish (es-CO)
copy on demo UI, English in code and docs prose.

## Anti-references

- Generic SaaS landing gradients, hero metrics, marketing buzzwords.
- Fake data that hides whether the integration really ran (every number on
  screen must come from the live Convex deployment / Wompi sandbox).
- Cream-paper "AI default" surfaces.

## Strategic design principles

1. State is the product: payment/subscription status transitions must be the
   most legible thing on screen (semantic chips, live updates, no refresh).
2. Density over decoration: timelines and panels can be dense; decoration
   cannot.
3. Sandbox honesty: test-mode badges, real references, real Wompi test cards
   documented inline.

## Accessibility

WCAG AA contrast minimums, keyboard-reachable forms, `prefers-reduced-motion`
honored.
