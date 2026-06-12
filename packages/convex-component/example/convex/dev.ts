import { v } from "convex/values";
import { action, mutation } from "./_generated/server.js";
import { components } from "./_generated/api.js";
import { wompi } from "./wompi.js";

// Demo-only helpers. They exist so the example can exercise a month of
// billing in seconds — don't expose functions like these in a real app.

/** Push the catalog from wompi.ts into the component. Idempotent. */
export const seed = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await wompi.syncProducts(ctx);
    return null;
  },
});

/** Run a billing cycle right now instead of waiting for the cron. */
export const runBilling = action({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await wompi.processBilling(ctx);
  },
});

/**
 * Time travel: make the subscription due now, then run billing — a renewal
 * (or dunning retry / trial conversion / cancel finalization) happens live.
 */
export const simulateRenewal = action({
  args: { subscriptionId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    await ctx.runMutation(components.wompi.subscriptions.setNextChargeAt, {
      subscriptionId: args.subscriptionId as never,
      at: Date.now() - 1_000,
    });
    return await wompi.processBilling(ctx);
  },
});
