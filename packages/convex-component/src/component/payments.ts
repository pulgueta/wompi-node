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
 * Read bytes that the sweep keeps free in its transaction. It stops when less
 * remains. This is more than one document of the maximum size (1 MiB) plus
 * the row that tells if more work remains.
 */
const SWEEP_READ_RESERVE_BYTES = 4 * 1024 * 1024;

/**
 * Claim the pending payments the billing sweep must look at: reconcile
 * against the Wompi API (when a transaction id exists, and for server-side
 * charges) or expire (abandoned checkouts).
 *
 * The sweep rotates. Each call continues after the last stale row that the
 * previous call visited, oldest first. When a call gets to the end of the
 * stale rows, the next call starts again at the oldest one. Thus each stale
 * row is reached however many rows stay pending. The position is in the
 * `sweepCursors` table, so the sweep writes no payment row.
 *
 * A call stops at `limit` returned rows, at `SWEEP_SCAN_LIMIT` visited rows,
 * or when less than `SWEEP_READ_RESERVE_BYTES` of the read limit remains.
 *
 * An abandoned checkout has no work until it is `expireAfterMs` old. It is
 * passed but not returned, so it does not use a place in the batch.
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

    // No row before the first call: the pass starts at the oldest payment.
    const state = await ctx.db.query("sweepCursors").first();
    const inPass = state !== null && state.cursor !== 0;
    // A new pass waits `olderThanMs` after the start of the last one. Thus
    // runs that schedule themselves do not ask Wompi about the same payments
    // again and again.
    if (!inPass && state && now - state.passStartedAt < args.olderThanMs) {
      return { payments: [], hasMore: false };
    }

    const stale = ctx.db
      .query("payments")
      .withIndex("by_status", (q) =>
        q
          .eq("status", "pending")
          .gt("_creationTime", state?.cursor ?? 0)
          .lte("_creationTime", staleBefore),
      );

    const payments = [];
    let visited = 0;
    let cursor = 0;
    let full = false;
    let hasMore = false;

    for await (const payment of stale) {
      // Do not stop between two rows with the same `_creationTime`: the
      // cursor cannot tell them apart, so the next call would skip one.
      if (full && payment._creationTime !== cursor) {
        hasMore = true;
        break;
      }
      cursor = payment._creationTime;
      visited++;

      const waitsToExpire =
        payment.kind === "checkout" &&
        payment.wompiTransactionId === undefined &&
        payment._creationTime > expirableBefore;
      if (!waitsToExpire) payments.push(payment);

      const { bytesRead } = await ctx.meta.getTransactionMetrics();
      full =
        payments.length >= limit ||
        visited >= SWEEP_SCAN_LIMIT ||
        bytesRead.remaining < SWEEP_READ_RESERVE_BYTES;
    }

    // At the end of the stale rows, the next pass starts at the oldest one.
    const next = hasMore ? cursor : 0;
    if (inPass) {
      if (state.cursor !== next) await ctx.db.patch("sweepCursors", state._id, { cursor: next });
    } else if (visited > 0) {
      // A pass that visited a row always writes the row. Two runs that start
      // a pass at the same time thus conflict, and Convex runs them one after
      // the other: the second one gets the wait time.
      const row = { cursor: next, passStartedAt: now };
      if (state) await ctx.db.patch("sweepCursors", state._id, row);
      else await ctx.db.insert("sweepCursors", row);
    }

    return { payments, hasMore };
  },
});
