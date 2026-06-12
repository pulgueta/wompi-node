import { Wompi } from "@pulgueta/wompi-convex";
import { components } from "./_generated/api.js";

/**
 * The Wompi client. Keys come from the deployment environment
 * (`npx convex env set WOMPI_PUBLIC_KEY pub_test_...`, etc.); sandbox mode is
 * inferred from the `pub_test_` prefix.
 */
export const wompi = new Wompi(components.wompi, {
  // Bridge to your auth system. This demo falls back to a shared demo user
  // so it runs without an auth provider — in production, throw instead.
  getUserInfo: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      return {
        userId: identity.tokenIdentifier,
        email: identity.email ?? "user@example.com",
        fullName: identity.name,
      };
    }
    return {
      userId: "demo-user",
      email: "demo@wompi-convex.dev",
      fullName: "Usuario Demo",
    };
  },

  // The catalog is yours to define — Wompi has no product API. `syncProducts`
  // pushes it into the component (see dev.ts / the README).
  products: [
    {
      key: "pack-stickers",
      name: "Pack de stickers",
      description: "10 stickers troquelados para tu portátil.",
      type: "one_time",
      amountInCents: 1_990_000,
    },
    {
      key: "camiseta-dev",
      name: "Camiseta dev",
      description: "Algodón 100%, estampada en Medellín.",
      type: "one_time",
      amountInCents: 8_990_000,
    },
    {
      key: "starter",
      name: "Starter",
      description: "Para proyectos personales.",
      type: "subscription",
      amountInCents: 1_490_000,
      interval: "month",
      trialDays: 7,
    },
    {
      key: "pro-mensual",
      name: "Pro",
      description: "Para equipos que ya venden.",
      type: "subscription",
      amountInCents: 2_990_000,
      interval: "month",
    },
    {
      key: "pro-anual",
      name: "Pro anual",
      description: "Dos meses gratis, factura única.",
      type: "subscription",
      amountInCents: 29_900_000,
      interval: "year",
    },
  ],

  events: {
    onPaymentChange: async (_ctx, payment) => {
      console.log(`[wompi] pago ${payment.reference} → ${payment.status}`);
    },
    onSubscriptionChange: async (_ctx, subscription) => {
      console.log(
        `[wompi] suscripción ${subscription.productKey} → ${subscription.status}`,
      );
    },
  },
});

// The component's entire app-facing API, re-exported as public functions of
// this deployment. Identity always comes from getUserInfo, never the client.
export const {
  getConfig,
  listProducts,
  getCurrentSubscription,
  listSubscriptions,
  listPayments,
  getPayment,
  checkout,
  confirmTransaction,
  subscribe,
  cancelSubscription,
  resumeSubscription,
  changeSubscription,
} = wompi.api();
