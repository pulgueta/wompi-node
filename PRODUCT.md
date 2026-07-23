# Product

## Register

product

## Users

JavaScript and TypeScript developers, solution engineers, and technical evaluators testing the unofficial `@pulgueta/wompi` SDK in Wompi's Colombia sandbox. They need to understand the server and browser boundaries of a real payment flow before adapting it to their own application.

## Product Purpose

Provide one runnable, short sandbox scenario that demonstrates money entering through regular Wompi Checkout and leaving through a confirmed BRE-B payout. Success means a developer can see which SDK feature performs each operation, test both successful and failed sandbox states, and recover from errors without reading a generic API playground.

## Brand Personality

Credible, concise, transparent. The interface should feel calm enough for careful financial testing, direct enough for a developer scanning code and results, and honest about sandbox limitations.

## Anti-references

- Generic API playgrounds that expose unrelated endpoints without a coherent task.
- An imitation Wompi marketing site that competes with the official brand.
- Decorative fintech dashboards built from metric cards, gradients, glows, or ornamental charts.
- A payout-only form dump that makes developers assemble the end-to-end story themselves.

## Design Principles

1. **Tell one complete money story.** A customer purchase and its supplier settlement belong in the same short flow.
2. **Expose the SDK boundary.** Identify what runs in the browser, what stays on the server, and what Wompi hosts.
3. **Make sandbox safety explicit.** Never imply that documented aliases or card numbers are real credentials or move real money.
4. **Show outcomes, not requests.** Preserve transaction IDs, payout IDs, final states, and recovery actions after every operation.
5. **Prefer live behavior over assumptions.** Treat current Wompi responses and signed status checks as the source of truth.

## Accessibility & Inclusion

Target WCAG 2.2 AA. All actions and status changes must be keyboard accessible, screen-reader announced, and understandable without relying on color alone. Forms need persistent labels and actionable errors. Responsive layouts must remain usable at narrow widths, and all non-essential motion must respect reduced-motion preferences.
