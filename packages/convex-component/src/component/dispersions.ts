import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import {
  dispersionDoc,
  dispersionTransactionDoc,
  isTerminalPayoutStatus,
  isTerminalPayoutTransactionStatus,
} from "./shared.js";

type DispersionBackfill = {
  reference?: string;
  paymentType?: string;
  transactionsTotal?: number;
  transactionsSuccess?: number;
  transactionsFailed?: number;
  amountInCents?: number;
};

/**
 * A row created from a webhook stub (the event outran `record`, or the batch
 * was created outside the component) has empty identity fields and zero
 * counts. Any later write that knows the real values fills them in.
 */
const dispersionBackfill = (
  existing: {
    reference: string;
    paymentType: string;
    transactionsTotal: number;
    transactionsSuccess: number;
    transactionsFailed: number;
    amountInCents?: number;
  },
  incoming: {
    reference?: string;
    paymentType?: string;
    transactionsTotal?: number;
    transactionsSuccess?: number;
    transactionsFailed?: number;
    amountInCents?: number;
  },
): DispersionBackfill => {
  const patch: DispersionBackfill = {};

  if (existing.reference === "" && incoming.reference) patch.reference = incoming.reference;
  if (existing.paymentType === "" && incoming.paymentType) {
    patch.paymentType = incoming.paymentType;
  }
  if (existing.transactionsTotal === 0 && incoming.transactionsTotal) {
    patch.transactionsTotal = incoming.transactionsTotal;
  }
  if (
    existing.transactionsSuccess === 0 &&
    existing.transactionsFailed === 0 &&
    ((incoming.transactionsSuccess ?? 0) !== 0 ||
      (incoming.transactionsFailed ?? 0) !== 0)
  ) {
    patch.transactionsSuccess = incoming.transactionsSuccess ?? 0;
    patch.transactionsFailed = incoming.transactionsFailed ?? 0;
  }
  if (existing.amountInCents === undefined && incoming.amountInCents !== undefined) {
    patch.amountInCents = incoming.amountInCents;
  }

  return patch;
};

/**
 * Record a dispersion right after the Payouts API accepted the batch. Upserts
 * by Wompi payout id: a retried action re-recording the same payout returns
 * the existing row instead of duplicating it (Wompi already guarded the
 * create itself with the idempotency key).
 */
export const record = mutation({
  args: {
    wompiPayoutId: v.string(),
    reference: v.string(),
    status: v.string(),
    paymentType: v.string(),
    transactionsTotal: v.number(),
    transactionsSuccess: v.number(),
    transactionsFailed: v.number(),
    amountInCents: v.optional(v.number()),
    metadata: v.optional(v.record(v.string(), v.any())),
  },
  returns: dispersionDoc,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dispersions")
      .withIndex("by_wompi_payout_id", (q) => q.eq("wompiPayoutId", args.wompiPayoutId))
      .unique();

    if (existing) {
      // A webhook may have raced the create and left a stub — enrich it with
      // the create result instead of returning it untouched.
      const patch = dispersionBackfill(existing, args);
      if (Object.keys(patch).length === 0) return existing;

      await ctx.db.patch("dispersions", existing._id, patch);
      return (await ctx.db.get("dispersions", existing._id))!;
    }

    const dispersionId = await ctx.db.insert("dispersions", args);
    return (await ctx.db.get("dispersions", dispersionId))!;
  },
});

/**
 * Apply a `payout.updated` event to the dispersion row. Idempotent: a
 * redelivered status reports `changed: false` so app callbacks fire exactly
 * once per real state change. Unknown payout ids get a minimal row — events
 * also arrive for batches created outside the component (dashboard, direct
 * API calls).
 */
export const applyPayoutUpdate = mutation({
  args: {
    wompiPayoutId: v.string(),
    status: v.string(),
    reference: v.optional(v.string()),
    paymentType: v.optional(v.string()),
    transactionsTotal: v.optional(v.number()),
    amountInCents: v.optional(v.number()),
    eventTimestamp: v.optional(v.number()),
  },
  returns: v.object({ changed: v.boolean(), dispersion: dispersionDoc }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dispersions")
      .withIndex("by_wompi_payout_id", (q) => q.eq("wompiPayoutId", args.wompiPayoutId))
      .unique();

    if (!existing) {
      const dispersionId = await ctx.db.insert("dispersions", {
        wompiPayoutId: args.wompiPayoutId,
        reference: args.reference ?? "",
        status: args.status,
        paymentType: args.paymentType ?? "",
        transactionsSuccess: 0,
        transactionsFailed: 0,
        transactionsTotal: args.transactionsTotal ?? 0,
        amountInCents: args.amountInCents,
        sourceEventTimestamp: args.eventTimestamp,
        finalizedAt: isTerminalPayoutStatus(args.status) ? Date.now() : undefined,
      });
      return { changed: true, dispersion: (await ctx.db.get("dispersions", dispersionId))! };
    }

    if (
      args.eventTimestamp !== undefined &&
      existing.sourceEventTimestamp !== undefined &&
      args.eventTimestamp < existing.sourceEventTimestamp
    ) {
      return { changed: false, dispersion: existing };
    }

    const patch: DispersionBackfill & {
      status?: string;
      sourceEventTimestamp?: number;
      finalizedAt?: number;
    } = dispersionBackfill(existing, args);
    let changed = Object.keys(patch).length > 0;

    // `payout.updated` is authoritative. The create request sum can include
    // transactions Wompi later rejects during validation, and webhook stubs
    // otherwise have no total at all.
    if (
      args.transactionsTotal !== undefined &&
      existing.transactionsTotal !== args.transactionsTotal
    ) {
      patch.transactionsTotal = args.transactionsTotal;
      changed = true;
    }
    if (args.amountInCents !== undefined && existing.amountInCents !== args.amountInCents) {
      patch.amountInCents = args.amountInCents;
      changed = true;
    }

    // Wompi retries deliveries and may deliver out of order: a stale
    // non-terminal status must never overwrite a settled batch.
    const staleRegression =
      isTerminalPayoutStatus(existing.status) && !isTerminalPayoutStatus(args.status);

    if (existing.status !== args.status && !staleRegression) {
      patch.status = args.status;
      changed = true;
      if (isTerminalPayoutStatus(args.status) && existing.finalizedAt === undefined) {
        patch.finalizedAt = Date.now();
      }
    }

    if (
      args.eventTimestamp !== undefined &&
      existing.sourceEventTimestamp !== args.eventTimestamp
    ) {
      patch.sourceEventTimestamp = args.eventTimestamp;
    }

    if (Object.keys(patch).length === 0) {
      return { changed: false, dispersion: existing };
    }

    await ctx.db.patch("dispersions", existing._id, patch);

    return { changed, dispersion: (await ctx.db.get("dispersions", existing._id))! };
  },
});

/**
 * Apply a payout `transaction.updated` event, upserting the per-beneficiary
 * row by Wompi transaction id. The event carries the payout id, so a missing
 * parent (batch created outside the component, or the transaction event
 * outrunning its `payout.updated`) is lazily created the same way as in
 * {@link applyPayoutUpdate}.
 */
export const applyTransactionUpdate = mutation({
  args: {
    wompiPayoutId: v.string(),
    wompiTransactionId: v.string(),
    status: v.string(),
    amountInCents: v.number(),
    reference: v.optional(v.string()),
    payeeName: v.optional(v.string()),
    payeeKey: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    eventTimestamp: v.optional(v.number()),
  },
  returns: v.object({
    changed: v.boolean(),
    dispersionChanged: v.boolean(),
    transaction: dispersionTransactionDoc,
    dispersion: dispersionDoc,
  }),
  handler: async (ctx, args) => {
    let dispersion = await ctx.db
      .query("dispersions")
      .withIndex("by_wompi_payout_id", (q) => q.eq("wompiPayoutId", args.wompiPayoutId))
      .unique();
    let dispersionChanged = false;

    if (!dispersion) {
      const dispersionId = await ctx.db.insert("dispersions", {
        wompiPayoutId: args.wompiPayoutId,
        reference: "",
        status: "PENDING",
        paymentType: "",
        transactionsTotal: 0,
        transactionsSuccess: 0,
        transactionsFailed: 0,
      });
      dispersion = (await ctx.db.get("dispersions", dispersionId))!;
      dispersionChanged = true;
    }

    const existing = await ctx.db
      .query("dispersionTransactions")
      .withIndex("by_wompi_transaction_id", (q) =>
        q.eq("wompiTransactionId", args.wompiTransactionId),
      )
      .unique();

    if (!existing) {
      const transactionId = await ctx.db.insert("dispersionTransactions", {
        dispersionId: dispersion._id,
        wompiTransactionId: args.wompiTransactionId,
        reference: args.reference,
        status: args.status,
        amountInCents: args.amountInCents,
        payeeName: args.payeeName,
        payeeKey: args.payeeKey,
        failureReason: args.failureReason,
        sourceEventTimestamp: args.eventTimestamp,
        updatedAt: Date.now(),
      });
      return {
        changed: true,
        dispersionChanged,
        transaction: (await ctx.db.get("dispersionTransactions", transactionId))!,
        dispersion,
      };
    }

    if (
      args.eventTimestamp !== undefined &&
      existing.sourceEventTimestamp !== undefined &&
      args.eventTimestamp < existing.sourceEventTimestamp
    ) {
      return { changed: false, dispersionChanged, transaction: existing, dispersion };
    }

    // Same terminal guard as the batch for callers that do not have a source
    // timestamp. Timestamped webhook deliveries are additionally ordered by
    // the signed source cursor above.
    const staleRegression =
      isTerminalPayoutTransactionStatus(existing.status) &&
      !isTerminalPayoutTransactionStatus(args.status);

    if (staleRegression) {
      return { changed: false, dispersionChanged, transaction: existing, dispersion };
    }

    const patch: {
      status?: string;
      amountInCents?: number;
      reference?: string;
      payeeName?: string;
      payeeKey?: string;
      failureReason?: string;
      sourceEventTimestamp?: number;
      updatedAt?: number;
    } = {};
    let changed = false;

    if (existing.status !== args.status) {
      patch.status = args.status;
      changed = true;
    }
    if (existing.amountInCents !== args.amountInCents) {
      patch.amountInCents = args.amountInCents;
      changed = true;
    }
    for (const field of ["reference", "payeeName", "payeeKey", "failureReason"] as const) {
      if (args[field] !== undefined && existing[field] !== args[field]) {
        patch[field] = args[field];
        changed = true;
      }
    }
    if (
      args.eventTimestamp !== undefined &&
      existing.sourceEventTimestamp !== args.eventTimestamp
    ) {
      patch.sourceEventTimestamp = args.eventTimestamp;
    }

    if (Object.keys(patch).length === 0) {
      return { changed: false, dispersionChanged, transaction: existing, dispersion };
    }

    if (changed) patch.updatedAt = Date.now();
    await ctx.db.patch("dispersionTransactions", existing._id, patch);

    return {
      changed,
      dispersionChanged,
      transaction: (await ctx.db.get("dispersionTransactions", existing._id))!,
      dispersion,
    };
  },
});

export const get = query({
  args: { wompiPayoutId: v.string() },
  returns: v.union(dispersionDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dispersions")
      .withIndex("by_wompi_payout_id", (q) => q.eq("wompiPayoutId", args.wompiPayoutId))
      .unique();
  },
});

export const getByReference = query({
  args: { reference: v.string() },
  returns: v.union(dispersionDoc, v.null()),
  handler: async (ctx, args) => {
    // References are app-chosen and Wompi does not enforce their uniqueness
    // across batches, so answer with the most recent match.
    return await ctx.db
      .query("dispersions")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .order("desc")
      .first();
  },
});

export const list = query({
  args: { status: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.array(dispersionDoc),
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);

    if (args.status !== undefined) {
      return await ctx.db
        .query("dispersions")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
    }

    return await ctx.db.query("dispersions").order("desc").take(limit);
  },
});

export const listTransactions = query({
  args: { dispersionId: v.id("dispersions"), limit: v.optional(v.number()) },
  returns: v.array(dispersionTransactionDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dispersionTransactions")
      .withIndex("by_dispersion_id", (q) => q.eq("dispersionId", args.dispersionId))
      .take(Math.min(args.limit ?? 200, 500));
  },
});
