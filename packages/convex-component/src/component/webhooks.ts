import { makeFunctionReference } from "convex/server";
import type { FunctionHandle } from "convex/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { mutation } from "./_generated/server.js";
import { dispersionDoc } from "./shared.js";

type DispersionDoc = Infer<typeof dispersionDoc>;
type DispersionChange = Pick<
  DispersionDoc,
  | "wompiPayoutId"
  | "reference"
  | "status"
  | "paymentType"
  | "transactionsTotal"
  | "transactionsSuccess"
  | "transactionsFailed"
  | "amountInCents"
  | "finalizedAt"
>;
type DispersionCallbackHandle = FunctionHandle<
  "mutation",
  { dispersion: DispersionChange },
  unknown
>;

const dispersionChange = (dispersion: DispersionDoc): DispersionChange => ({
  wompiPayoutId: dispersion.wompiPayoutId,
  reference: dispersion.reference,
  status: dispersion.status,
  paymentType: dispersion.paymentType,
  transactionsTotal: dispersion.transactionsTotal,
  transactionsSuccess: dispersion.transactionsSuccess,
  transactionsFailed: dispersion.transactionsFailed,
  amountInCents: dispersion.amountInCents,
  finalizedAt: dispersion.finalizedAt,
});

type DeliveryResult = {
  duplicate: boolean;
  eventId: string;
  outcome?: string;
};

const recordEventReference = makeFunctionReference<
  "mutation",
  { checksum: string; eventType: string; timestamp: number; sentAt?: string },
  DeliveryResult
>("webhooks:recordEvent");

const markOutcomeReference = makeFunctionReference<
  "mutation",
  { eventId: string; outcome: string },
  null
>("webhooks:markOutcome");

const applyPayoutUpdateReference = makeFunctionReference<
  "mutation",
  {
    wompiPayoutId: string;
    status: string;
    reference?: string;
    paymentType?: string;
    transactionsTotal?: number;
    amountInCents?: number;
    eventTimestamp?: number;
  },
  { changed: boolean; dispersion: DispersionDoc }
>("dispersions:applyPayoutUpdate");

const applyTransactionUpdateReference = makeFunctionReference<
  "mutation",
  {
    wompiPayoutId: string;
    wompiTransactionId: string;
    status: string;
    amountInCents: number;
    reference?: string;
    payeeName?: string;
    payeeKey?: string;
    failureReason?: string;
    eventTimestamp?: number;
  },
  { changed: boolean; dispersionChanged: boolean; dispersion: DispersionDoc }
>("dispersions:applyTransactionUpdate");

const normalizeEventTimestamp = (timestamp: number): number =>
  // Payments events use Unix seconds; Payouts events use Unix milliseconds.
  timestamp >= 100_000_000_000 ? Math.floor(timestamp / 1_000) : timestamp;

/**
 * Record a verified webhook delivery, deduplicated by Wompi's checksum
 * (identical for redeliveries of the same event, distinct across events).
 * Returns whether this delivery was already processed so app callbacks run
 * exactly once. Duplicates carry the recorded `outcome` — a duplicate whose
 * outcome was never marked crashed mid-apply, and callers may reprocess it.
 */
export const recordEvent = mutation({
  args: {
    checksum: v.string(),
    eventType: v.string(),
    // Absent on payout events — their envelope carries no environment field.
    environment: v.optional(v.string()),
    timestamp: v.number(),
    sentAt: v.optional(v.string()),
    transactionId: v.optional(v.string()),
    reference: v.optional(v.string()),
  },
  returns: v.object({
    duplicate: v.boolean(),
    eventId: v.id("webhookEvents"),
    outcome: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_checksum", (q) => q.eq("checksum", args.checksum))
      .unique();

    if (existing) {
      return { duplicate: true, eventId: existing._id, outcome: existing.outcome };
    }

    const eventId = await ctx.db.insert("webhookEvents", {
      ...args,
      timestamp: normalizeEventTimestamp(args.timestamp),
    });
    return { duplicate: false, eventId };
  },
});

export const markOutcome = mutation({
  args: { eventId: v.id("webhookEvents"), outcome: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("webhookEvents", args.eventId);
    if (event) {
      await ctx.db.patch("webhookEvents", args.eventId, { outcome: args.outcome });
    }
    return null;
  },
});

const processedDelivery = v.object({
  duplicate: v.boolean(),
  outcome: v.string(),
});

/**
 * Deduplicate, apply and dispatch one `payout.updated` delivery inside a
 * single Convex mutation. An app callback failure rolls the whole transaction
 * back, allowing Wompi's retry to execute it again instead of losing it after
 * the component state commits.
 */
export const processPayoutUpdate = mutation({
  args: {
    checksum: v.string(),
    eventType: v.string(),
    timestamp: v.number(),
    sentAt: v.optional(v.string()),
    callbackHandle: v.optional(v.string()),
    payout: v.object({
      wompiPayoutId: v.string(),
      status: v.string(),
      reference: v.optional(v.string()),
      paymentType: v.optional(v.string()),
      transactionsTotal: v.optional(v.number()),
      amountInCents: v.optional(v.number()),
    }),
  },
  returns: processedDelivery,
  handler: async (ctx, args) => {
    const delivery = await ctx.runMutation(recordEventReference, {
      checksum: args.checksum,
      eventType: args.eventType,
      timestamp: args.timestamp,
      sentAt: args.sentAt,
    });

    if (delivery.duplicate && delivery.outcome !== undefined) {
      return { duplicate: true, outcome: delivery.outcome };
    }

    const result = await ctx.runMutation(applyPayoutUpdateReference, {
      ...args.payout,
      eventTimestamp: args.timestamp,
    });
    const outcome = result.changed ? "applied" : "noop";

    if (result.changed && args.callbackHandle) {
      await ctx.runMutation(args.callbackHandle as DispersionCallbackHandle, {
        dispersion: dispersionChange(result.dispersion),
      });
    }

    await ctx.runMutation(markOutcomeReference, {
      eventId: delivery.eventId,
      outcome,
    });
    return { duplicate: delivery.duplicate, outcome };
  },
});

/** Atomic counterpart for Payouts `transaction.updated` deliveries. */
export const processPayoutTransactionUpdate = mutation({
  args: {
    checksum: v.string(),
    eventType: v.string(),
    timestamp: v.number(),
    sentAt: v.optional(v.string()),
    callbackHandle: v.optional(v.string()),
    transaction: v.object({
      wompiPayoutId: v.string(),
      wompiTransactionId: v.string(),
      status: v.string(),
      amountInCents: v.number(),
      reference: v.optional(v.string()),
      payeeName: v.optional(v.string()),
      payeeKey: v.optional(v.string()),
      failureReason: v.optional(v.string()),
    }),
  },
  returns: processedDelivery,
  handler: async (ctx, args) => {
    const delivery = await ctx.runMutation(recordEventReference, {
      checksum: args.checksum,
      eventType: args.eventType,
      timestamp: args.timestamp,
      sentAt: args.sentAt,
    });

    if (delivery.duplicate && delivery.outcome !== undefined) {
      return { duplicate: true, outcome: delivery.outcome };
    }

    const result = await ctx.runMutation(applyTransactionUpdateReference, {
      ...args.transaction,
      eventTimestamp: args.timestamp,
    });
    const outcome = result.changed || result.dispersionChanged ? "applied" : "noop";

    if (result.dispersionChanged && args.callbackHandle) {
      await ctx.runMutation(args.callbackHandle as DispersionCallbackHandle, {
        dispersion: dispersionChange(result.dispersion),
      });
    }

    await ctx.runMutation(markOutcomeReference, {
      eventId: delivery.eventId,
      outcome,
    });
    return { duplicate: delivery.duplicate, outcome };
  },
});

/** Delete processed events older than the retention window, in batches. */
export const cleanup = mutation({
  args: { olderThanTimestamp: v.number(), limit: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("webhookEvents")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", args.olderThanTimestamp))
      .take(Math.min(args.limit ?? 100, 500));

    for (const event of old) {
      await ctx.db.delete("webhookEvents", event._id);
    }

    return old.length;
  },
});
