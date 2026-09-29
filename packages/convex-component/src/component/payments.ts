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

/** Rows one sweep reads at most, including the ones it has no work for. */
const SWEEP_SCAN_LIMIT = 500;

/**
 * Claim the pending payments the billing sweep must look at: reconcile
 * against the Wompi API (when a transaction id exists, and for server-side
 * charges) or expire (abandoned checkouts).
 *
 * The sweep rotates. It takes the stale rows it never visited, oldest first,
 * then the rows it visited more than `olderThanMs` ago, least recent first,
 * and stamps each one with `sweptAt`. A row that stays pending thus goes to
 * the end of the line, so each stale row is reached however many there are.
 *
 * An abandoned checkout has no work until it is `expireAfterMs` old. It is
 * stamped but not returned, so it does not use a place in the batch.
 *
 * `hasMore` is true when stale rows remain for an immediate next call.
 */
export const claimStalePending = mutation({
  args: {
    olderThanMs: v.number(),
    expireAfterMs: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.object({ payments: v.array(paymentDoc), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const staleBefore = now - args.olderThanMs;
    const expirableBefore = now - args.expireAfterMs;
    const limit = Math.min(args.limit ?? 50, 200);

    const neverSwept = await ctx.db
      .query("payments")
      .withIndex("by_status_swept_at", (q) =>
        q.eq("status", "pending").eq("sweptAt", undefined).lte("_creationTime", staleBefore),
      )
      .take(SWEEP_SCAN_LIMIT + 1);

    const sweptBefore =
      neverSwept.length > SWEEP_SCAN_LIMIT
        ? []
        : await ctx.db
            .query("payments")
            .withIndex("by_status_swept_at", (q) =>
              q.eq("status", "pending").gte("sweptAt", 0).lte("sweptAt", staleBefore),
            )
            .take(SWEEP_SCAN_LIMIT + 1 - neverSwept.length);

    const candidates = [...neverSwept, ...sweptBefore];
    const payments = [];
    let visited = 0;

    for (const payment of candidates.slice(0, SWEEP_SCAN_LIMIT)) {
      if (payments.length === limit) break;
      visited++;
      await ctx.db.patch("payments", payment._id, { sweptAt: now });

      const waitsToExpire =
        payment.kind === "checkout" &&
        payment.wompiTransactionId === undefined &&
        payment._creationTime > expirableBefore;
      if (!waitsToExpire) payments.push({ ...payment, sweptAt: now });
    }

    return { payments, hasMore: visited < candidates.length };
  },
});
