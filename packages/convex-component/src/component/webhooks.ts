import { v } from "convex/values";
import { mutation } from "./_generated/server.js";

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

    const eventId = await ctx.db.insert("webhookEvents", args);
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
