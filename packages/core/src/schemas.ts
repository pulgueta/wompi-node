/**
 * Public schema surface of `@pulgueta/wompi/schemas`.
 *
 * The payments API (snake_case, `production.wompi.co`) and the Payouts API
 * (camelCase, `api.payouts.wompi.co`) are separate Wompi products, so their
 * schemas live in separate modules; this barrel re-exports both.
 */
export * from "@/payments-schemas";
export * from "@/payouts-schemas";
