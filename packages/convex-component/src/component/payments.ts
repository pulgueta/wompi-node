import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { paymentDoc } from "./shared.js";

/**
 * Create the pending payment row backing a Web Checkout redirect. The
 * `reference` (generated app-side) is what ties the Wompi transaction back to
 * this row when the webhook or reconciliation lands.
 */
export const createCheckout = mutation({
  args: {
    reference: v.string(),
    customerId: v.id("customers"),
    userId: v.string(),
    productKey: v.optional(v.string()),
    amountInCents: v.optional(v.number()),
    description: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.any())),
  },
  returns: paymentDoc,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .unique();

    if (existing) {
      throw new Error(`A payment with reference "${args.reference}" already exists`);
    }

    let amountInCents = args.amountInCents;
    let description = args.description;
    let productId;

    if (args.productKey) {
      const product = await ctx.db
        .query("products")
        .withIndex("by_key", (q) => q.eq("key", args.productKey!))
        .unique();

      if (!product) throw new Error(`Unknown product "${args.productKey}"`);
      if (product.type !== "one_time") {
        throw new Error(
          `Product "${args.productKey}" is a subscription; use subscribe instead`,
        );
      }
      if (!product.active) throw new Error(`Product "${args.productKey}" is archived`);

      amountInCents = product.amountInCents;
      description = description ?? product.name;
      productId = product._id;
    }

    if (amountInCents === undefined || !Number.isInteger(amountInCents) || amountInCents <= 0) {
      throw new Error("Either a productKey or a positive integer amountInCents is required");
    }

    const paymentId = await ctx.db.insert("payments", {
      reference: args.reference,
      kind: "checkout",
      status: "pending",
      customerId: args.customerId,
      userId: args.userId,
      productId,
      productKey: args.productKey,
      amountInCents,
      currency: "COP",
      description,
      metadata: args.metadata,
    });

    return (await ctx.db.get("payments", paymentId))!;
  },
});

export const getByReference = query({
  args: { reference: v.string() },
  returns: v.union(paymentDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .unique();
  },
});

export const listByUser = query({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(paymentDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));
  },
});

/**
 * Pending payments the billing sweep should look at: either reconcile against
 * the Wompi API (when a transaction id exists) or expire (abandoned
 * checkouts).
 */
export const listStalePending = query({
  args: { olderThanMs: v.number(), limit: v.optional(v.number()) },
  returns: v.array(paymentDoc),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanMs;
    const pending = await ctx.db
      .query("payments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(Math.min(args.limit ?? 50, 200));

    return pending.filter((p) => p._creationTime <= cutoff);
  },
});
