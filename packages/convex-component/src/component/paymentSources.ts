import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { applyChargeOutcome } from "./billing.js";
import {
  billingConfigValidator,
  isRecurrentCharge,
  paymentDoc,
  paymentSourceDoc,
  subscriptionDoc,
} from "./shared.js";
import { claimResumePayment, findTokenSource, swapPaymentSource } from "./subscriptions.js";

const tokenOutcome = v.object({
  outcome: v.string(),
  subscriptionChanged: v.boolean(),
  subscription: v.union(subscriptionDoc, v.null()),
  /** The charge the caller must run now. */
  payment: v.union(paymentDoc, v.null()),
  /** The Wompi payment source that the row stores, to charge `payment`. */
  wompiSourceId: v.optional(v.number()),
  /** Credential-on-File flag for `payment`. Set when `payment` is set. */
  recurrent: v.optional(v.boolean()),
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
    const source = await findTokenSource(ctx, args.tokenId);
    if (!source) return null;

    const customer = await ctx.db.get("customers", source.customerId);
    if (!customer) return null;

    return { source, customerEmail: customer.email };
  },
});

/**
 * Claim the creation of the Wompi payment source of an approved Nequi token.
 * Wompi has no idempotency key for this request, so only the run with
 * `claimed: true` sends it; a run that finds the claim of another run sends
 * nothing. The claim expires after `leaseMs`, for a run that crashed.
 *
 * Null for tokens the component does not own — merchants can tokenize Nequi
 * accounts outside the component.
 */
export const claimActivation = mutation({
  args: { tokenId: v.string(), leaseMs: v.number() },
  returns: v.union(
    v.object({
      claimed: v.boolean(),
      status: v.string(),
      wompiSourceId: v.optional(v.number()),
      /** The email the Wompi payment source must be created for. */
      customerEmail: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const source = await findTokenSource(ctx, args.tokenId);
    if (!source) return null;

    const customer = await ctx.db.get("customers", source.customerId);
    if (!customer) return null;

    const now = Date.now();
    const claimed =
      source.wompiSourceId === undefined &&
      source.status === "PENDING" &&
      (source.activationClaimedAt === undefined ||
        source.activationClaimedAt + args.leaseMs <= now);
    if (claimed) {
      await ctx.db.patch("paymentSources", source._id, { activationClaimedAt: now });
    }

    return {
      claimed,
      status: source.status,
      wompiSourceId: source.wompiSourceId,
      customerEmail: customer.email,
    };
  },
});

/**
 * Record the Wompi payment source of an approved Nequi token. A replacement
 * source becomes the subscription's current source, and a subscription that
 * waits for its first charge gets the payment the caller must charge.
 *
 * Idempotent: a replayed approval returns the same pending payment, and
 * nothing once that payment has a Wompi transaction. The row keeps the first
 * Wompi payment source; `wompiSourceId` in the result is the one to charge.
 */
export const activate = mutation({
  args: { tokenId: v.string(), wompiSourceId: v.number(), status: v.string() },
  returns: tokenOutcome,
  handler: async (ctx, args) => {
    const source = await findTokenSource(ctx, args.tokenId);
    if (!source) return UNKNOWN_TOKEN;

    const activated = source.wompiSourceId === undefined;
    // Only a token that still waits can become active: not a declined token,
    // and not a source that another source replaced.
    if (activated && source.status !== "PENDING") {
      return { outcome: "noop", subscriptionChanged: false, subscription: null, payment: null };
    }
    if (activated) {
      await ctx.db.patch("paymentSources", source._id, {
        wompiSourceId: args.wompiSourceId,
        status: args.status,
        activationClaimedAt: undefined,
      });
    }

    let subscription: Doc<"subscriptions"> | null = source.subscriptionId
      ? await ctx.db.get("subscriptions", source.subscriptionId)
      : null;
    let subscriptionChanged = false;
    let payment: Doc<"payments"> | null = null;

    if (subscription && subscription.status !== "canceled") {
      // A trial that ended before the approval is `past_due` with this
      // source: it becomes due now, as with a replacement.
      if (
        activated &&
        (subscription.paymentSourceId !== source._id || subscription.status === "past_due")
      ) {
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
      wompiSourceId: source.wompiSourceId ?? args.wompiSourceId,
      // A resumed subscription may have approved payments at an older price.
      recurrent:
        payment?.subscriptionId !== undefined
          ? await isRecurrentCharge(ctx, payment.subscriptionId, payment)
          : undefined,
    };
  },
});

/**
 * Record that the customer declined the Nequi token. A subscription that
 * never had a payment method that works (`incomplete`, `trialing`) is
 * canceled with `lastError`, and its payment that waits for the approval ends
 * as `error`. A declined replacement leaves the subscription as it is.
 *
 * A subscription with a payment that is already at Wompi is not canceled:
 * Wompi can still approve that transaction.
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
    const source = await findTokenSource(ctx, args.tokenId);
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

    const inFlight = waiting?.wompiTransactionId !== undefined;
    if (
      !inFlight &&
      (subscription.status === "incomplete" || subscription.status === "trialing")
    ) {
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
    const source = await findTokenSource(ctx, args.tokenId);
    if (!source || source.userId !== args.userId) return null;
    return source.status;
  },
});
