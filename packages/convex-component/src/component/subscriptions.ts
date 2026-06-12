import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import type { QueryCtx } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import {
  ENTITLED_STATUSES,
  paymentDoc,
  paymentSourceInputValidator,
  subscriptionChargeReference,
  subscriptionDoc,
  subscriptionWithProduct,
} from "./shared.js";

const STATUS_PRIORITY: Record<string, number> = {
  active: 0,
  trialing: 1,
  past_due: 2,
};

const joinProduct = async (ctx: QueryCtx, subscription: Doc<"subscriptions">) => ({
  ...subscription,
  product: await ctx.db.get("products", subscription.productId),
});

/**
 * Create (or resume) a subscription for a saved payment source.
 *
 * - Fresh subscription with a trial: starts `trialing` immediately, no
 *   initial charge; the billing cron converts it when the trial ends.
 * - Fresh subscription without a trial: starts `incomplete` and claims the
 *   initial payment row the caller must charge.
 * - Existing `incomplete`/`unpaid` subscription for the same product: reused
 *   with the new payment source and a fresh charge attempt.
 */
export const create = mutation({
  args: {
    customerId: v.id("customers"),
    userId: v.string(),
    productKey: v.string(),
    paymentSource: paymentSourceInputValidator,
    metadata: v.optional(v.record(v.string(), v.any())),
  },
  returns: v.object({
    subscription: subscriptionDoc,
    payment: v.union(paymentDoc, v.null()),
  }),
  handler: async (ctx, args) => {
    const product = await ctx.db
      .query("products")
      .withIndex("by_key", (q) => q.eq("key", args.productKey))
      .unique();

    if (!product) throw new Error(`Unknown product "${args.productKey}"`);
    if (product.type !== "subscription") {
      throw new Error(`Product "${args.productKey}" is not a subscription`);
    }
    if (!product.active) throw new Error(`Product "${args.productKey}" is archived`);
    if (!product.interval) {
      throw new Error(`Product "${args.productKey}" has no billing interval`);
    }

    const now = Date.now();

    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .take(64);

    const sameProduct = existing.filter((s) => s.productKey === args.productKey);

    if (sameProduct.some((s) => ENTITLED_STATUSES.includes(s.status))) {
      throw new Error(
        `An active subscription to "${args.productKey}" already exists for this user`,
      );
    }

    const paymentSourceId = await ctx.db.insert("paymentSources", {
      customerId: args.customerId,
      userId: args.userId,
      ...args.paymentSource,
    });

    const resumable = sameProduct.find(
      (s) => s.status === "incomplete" || s.status === "unpaid",
    );

    if (resumable) {
      const attempt = resumable.failedAttempts;
      const reference = subscriptionChargeReference(resumable._id, `r${now}`, attempt);

      await ctx.db.patch("subscriptions", resumable._id, {
        paymentSourceId,
        amountInCents: product.amountInCents,
        currency: product.currency,
        interval: product.interval,
        intervalCount: product.intervalCount ?? 1,
        productId: product._id,
        lastError: undefined,
      });

      const paymentId = await ctx.db.insert("payments", {
        reference,
        kind: "subscription",
        status: "pending",
        customerId: args.customerId,
        userId: args.userId,
        productId: product._id,
        productKey: product.key,
        subscriptionId: resumable._id,
        amountInCents: product.amountInCents,
        currency: product.currency,
        description: product.name,
        attempt,
      });

      return {
        subscription: (await ctx.db.get("subscriptions", resumable._id))!,
        payment: (await ctx.db.get("payments", paymentId))!,
      };
    }

    const trialDays = product.trialDays ?? 0;
    const interval = product.interval;
    const intervalCount = product.intervalCount ?? 1;

    if (trialDays > 0) {
      const trialEndsAt = now + trialDays * 86_400_000;
      const subscriptionId = await ctx.db.insert("subscriptions", {
        customerId: args.customerId,
        userId: args.userId,
        productId: product._id,
        productKey: product.key,
        paymentSourceId,
        status: "trialing",
        amountInCents: product.amountInCents,
        currency: product.currency,
        interval,
        intervalCount,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        nextChargeAt: trialEndsAt,
        cancelAtPeriodEnd: false,
        trialEndsAt,
        failedAttempts: 0,
        metadata: args.metadata,
      });

      return { subscription: (await ctx.db.get("subscriptions", subscriptionId))!, payment: null };
    }

    const subscriptionId = await ctx.db.insert("subscriptions", {
      customerId: args.customerId,
      userId: args.userId,
      productId: product._id,
      productKey: product.key,
      paymentSourceId,
      status: "incomplete",
      amountInCents: product.amountInCents,
      currency: product.currency,
      interval,
      intervalCount,
      currentPeriodStart: now,
      currentPeriodEnd: now,
      cancelAtPeriodEnd: false,
      failedAttempts: 0,
      metadata: args.metadata,
    });

    const paymentId = await ctx.db.insert("payments", {
      reference: subscriptionChargeReference(subscriptionId, "init", 0),
      kind: "subscription",
      status: "pending",
      customerId: args.customerId,
      userId: args.userId,
      productId: product._id,
      productKey: product.key,
      subscriptionId,
      amountInCents: product.amountInCents,
      currency: product.currency,
      description: product.name,
      attempt: 0,
    });

    return {
      subscription: (await ctx.db.get("subscriptions", subscriptionId))!,
      payment: (await ctx.db.get("payments", paymentId))!,
    };
  },
});

/**
 * The user's current entitlement for a product (or any product). `past_due`
 * still grants access — dunning grace, Stripe-style. Reactive: webhook and
 * cron writes invalidate subscribers automatically.
 */
export const getCurrent = query({
  args: { userId: v.string(), productKey: v.optional(v.string()) },
  returns: v.union(subscriptionWithProduct, v.null()),
  handler: async (ctx, args) => {
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .take(64);

    const live = subscriptions
      .filter((s) => ENTITLED_STATUSES.includes(s.status))
      .filter((s) => (args.productKey ? s.productKey === args.productKey : true))
      .sort(
        (a, b) =>
          (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9) ||
          b._creationTime - a._creationTime,
      );

    if (live.length === 0) return null;
    return await joinProduct(ctx, live[0]);
  },
});

export const listByUser = query({
  args: { userId: v.string() },
  returns: v.array(subscriptionWithProduct),
  handler: async (ctx, args) => {
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100);

    return await Promise.all(subscriptions.map((s) => joinProduct(ctx, s)));
  },
});

export const get = query({
  args: { subscriptionId: v.id("subscriptions") },
  returns: v.union(subscriptionWithProduct, v.null()),
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get("subscriptions", args.subscriptionId);
    if (!subscription) return null;
    return await joinProduct(ctx, subscription);
  },
});

/**
 * Cancel a subscription. By default access continues until the period ends
 * and the billing cron finalizes the cancellation; `immediately` revokes now.
 */
export const cancel = mutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    userId: v.string(),
    immediately: v.optional(v.boolean()),
  },
  returns: subscriptionDoc,
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get("subscriptions", args.subscriptionId);
    if (!subscription || subscription.userId !== args.userId) {
      throw new Error("Subscription not found");
    }
    if (subscription.status === "canceled") {
      return subscription;
    }

    const now = Date.now();

    if (args.immediately || subscription.status === "incomplete") {
      await ctx.db.patch("subscriptions", subscription._id, {
        status: "canceled",
        cancelAtPeriodEnd: false,
        canceledAt: now,
        endedAt: now,
        nextChargeAt: undefined,
      });
    } else {
      await ctx.db.patch("subscriptions", subscription._id, {
        cancelAtPeriodEnd: true,
        canceledAt: now,
        // Keep nextChargeAt: the cron visit at period end finalizes instead
        // of charging.
        nextChargeAt: subscription.currentPeriodEnd,
      });
    }

    return (await ctx.db.get("subscriptions", subscription._id))!;
  },
});

/** Undo a pending cancel-at-period-end before the period actually ends. */
export const resume = mutation({
  args: { subscriptionId: v.id("subscriptions"), userId: v.string() },
  returns: subscriptionDoc,
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get("subscriptions", args.subscriptionId);
    if (!subscription || subscription.userId !== args.userId) {
      throw new Error("Subscription not found");
    }
    if (!subscription.cancelAtPeriodEnd || subscription.endedAt) {
      throw new Error("Subscription is not pending cancellation");
    }

    await ctx.db.patch("subscriptions", subscription._id, {
      cancelAtPeriodEnd: false,
      canceledAt: undefined,
    });

    return (await ctx.db.get("subscriptions", subscription._id))!;
  },
});

/**
 * Schedule a plan change. The switch (and the new price) applies at the next
 * renewal — no proration, the simple policy for a v0 billing engine.
 */
export const changeProduct = mutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    userId: v.string(),
    productKey: v.string(),
  },
  returns: subscriptionDoc,
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get("subscriptions", args.subscriptionId);
    if (!subscription || subscription.userId !== args.userId) {
      throw new Error("Subscription not found");
    }
    if (!ENTITLED_STATUSES.includes(subscription.status)) {
      throw new Error("Only live subscriptions can change products");
    }

    const product = await ctx.db
      .query("products")
      .withIndex("by_key", (q) => q.eq("key", args.productKey))
      .unique();

    if (!product || product.type !== "subscription" || !product.active) {
      throw new Error(`Unknown subscription product "${args.productKey}"`);
    }
    if (product._id === subscription.productId) {
      throw new Error("Subscription is already on this product");
    }

    await ctx.db.patch("subscriptions", subscription._id, {
      pendingProductId: product._id,
      pendingProductKey: product.key,
    });

    return (await ctx.db.get("subscriptions", subscription._id))!;
  },
});

/**
 * Testing/ops helper: make a subscription due now (or at a chosen time) so
 * the next billing run picks it up. Used to simulate renewals and dunning.
 */
export const setNextChargeAt = mutation({
  args: { subscriptionId: v.id("subscriptions"), at: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get("subscriptions", args.subscriptionId);
    if (!subscription) throw new Error("Subscription not found");

    await ctx.db.patch("subscriptions", subscription._id, {
      nextChargeAt: args.at,
      currentPeriodEnd: Math.min(subscription.currentPeriodEnd, args.at),
      trialEndsAt:
        subscription.trialEndsAt !== undefined
          ? Math.min(subscription.trialEndsAt, args.at)
          : undefined,
    });
    return null;
  },
});
