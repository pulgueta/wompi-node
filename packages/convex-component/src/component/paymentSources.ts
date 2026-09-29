import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { applyChargeOutcome } from "./billing.js";
import { billingConfigValidator, paymentDoc, paymentSourceDoc, subscriptionDoc } from "./shared.js";
import { claimResumePayment, swapPaymentSource } from "./subscriptions.js";

const tokenOutcome = v.object({
  outcome: v.string(),
  subscriptionChanged: v.boolean(),
  subscription: v.union(subscriptionDoc, v.null()),
  /** The charge the caller must run now. */
  payment: v.union(paymentDoc, v.null()),
});

const UNKNOWN_TOKEN = {
  outcome: "unknown_token",
  subscriptionChanged: false,
  subscription: null,
  payment: null,
};

/**
 * The source a Nequi token belongs to, with the email its Wompi payment
 * source must be created for. Null for tokens the component does not own —
 * merchants can tokenize Nequi accounts outside the component.
 */
export const getByTokenId = query({
  args: { tokenId: v.string() },
  returns: v.union(
    v.object({ source: paymentSourceDoc, customerEmail: v.string() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("paymentSources")
      .withIndex("by_token_id", (q) => q.eq("tokenId", args.tokenId))
      .unique();
    if (!source) return null;

    const customer = await ctx.db.get("customers", source.customerId);
    if (!customer) return null;

    return { source, customerEmail: customer.email };
  },
});

/**
 * Record the Wompi payment source of an approved Nequi token. A replacement
 * source becomes the subscription's current source, and a subscription that
 * waits for its first charge gets the payment the caller must charge.
 *
 * Idempotent: a replayed approval returns the same pending payment, and
 * nothing once that payment has a Wompi transaction.
 */
export const activate = mutation({
  args: { tokenId: v.string(), wompiSourceId: v.number(), status: v.string() },
  returns: tokenOutcome,
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("paymentSources")
      .withIndex("by_token_id", (q) => q.eq("tokenId", args.tokenId))
      .unique();
    if (!source) return UNKNOWN_TOKEN;

    const activated = source.wompiSourceId === undefined;
    if (activated) {
      await ctx.db.patch("paymentSources", source._id, {
        wompiSourceId: args.wompiSourceId,
        status: args.status,
      });
    }

    let subscription: Doc<"subscriptions"> | null = source.subscriptionId
      ? await ctx.db.get("subscriptions", source.subscriptionId)
      : null;
    let subscriptionChanged = false;
    let payment: Doc<"payments"> | null = null;

    if (subscription && subscription.status !== "canceled") {
      if (activated && subscription.paymentSourceId !== source._id) {
        subscription = await swapPaymentSource(ctx, subscription, source._id);
        subscriptionChanged = true;
      }

      const awaitsCharge =
        subscription.paymentSourceId === source._id &&
        (subscription.status === "incomplete" || subscription.status === "unpaid");
      if (awaitsCharge) {
        const claimed = await claimResumePayment(ctx, subscription);
        if (!claimed.wompiTransactionId) payment = claimed;
        subscription = (await ctx.db.get("subscriptions", subscription._id))!;
      }
    }

    return {
      outcome: activated ? "activated" : "noop",
      subscriptionChanged,
      subscription,
      payment,
    };
  },
});

/**
 * Record that the customer declined the Nequi token. A subscription that
 * never had a payment method that works (`incomplete`, `trialing`) is
 * canceled with `lastError`, and its payment that waits for the approval ends
 * as `error`. A declined replacement leaves the subscription as it is.
 */
export const decline = mutation({
  args: {
    tokenId: v.string(),
    reason: v.string(),
    config: billingConfigValidator,
    /** App mutation run in this transaction when a payment row changes. */
    callbackHandle: v.optional(v.string()),
  },
  returns: tokenOutcome,
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("paymentSources")
      .withIndex("by_token_id", (q) => q.eq("tokenId", args.tokenId))
      .unique();
    if (!source) return UNKNOWN_TOKEN;

    // Only a token that still waits can be declined.
    if (source.wompiSourceId !== undefined || source.status !== "PENDING") {
      return { outcome: "noop", subscriptionChanged: false, subscription: null, payment: null };
    }
    await ctx.db.patch("paymentSources", source._id, { status: "DECLINED" });

    const subscription = source.subscriptionId
      ? await ctx.db.get("subscriptions", source.subscriptionId)
      : null;
    if (!subscription || subscription.paymentSourceId !== source._id) {
      return {
        outcome: "declined",
        subscriptionChanged: false,
        subscription: null,
        payment: null,
      };
    }

    const waiting = await ctx.db
      .query("payments")
      .withIndex("by_subscription_id_status", (q) =>
        q.eq("subscriptionId", subscription._id).eq("status", "pending"),
      )
      .first();
    if (waiting && !waiting.wompiTransactionId) {
      await applyChargeOutcome(
        ctx,
        waiting,
        { nextStatus: "error", failureReason: args.reason },
        args.config,
        args.callbackHandle,
      );
    }

    if (subscription.status === "incomplete" || subscription.status === "trialing") {
      const now = Date.now();
      await ctx.db.patch("subscriptions", subscription._id, {
        status: "canceled",
        cancelAtPeriodEnd: false,
        canceledAt: now,
        endedAt: now,
        nextChargeAt: undefined,
        lastError: args.reason,
      });
    } else {
      await ctx.db.patch("subscriptions", subscription._id, { lastError: args.reason });
    }

    return {
      outcome: "declined",
      subscriptionChanged: true,
      subscription: await ctx.db.get("subscriptions", subscription._id),
      payment: waiting ? await ctx.db.get("payments", waiting._id) : null,
    };
  },
});

/**
 * The state of the signed-in user's source for a Nequi token, for a reactive
 * "approve in your Nequi app" screen. Null for a token of another user.
 */
export const getStatusByTokenId = query({
  args: { tokenId: v.string(), userId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("paymentSources")
      .withIndex("by_token_id", (q) => q.eq("tokenId", args.tokenId))
      .unique();
    if (!source || source.userId !== args.userId) return null;
    return source.status;
  },
});
