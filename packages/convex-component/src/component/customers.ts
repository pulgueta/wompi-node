import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { customerDoc } from "./shared.js";

export const upsert = mutation({
  args: {
    userId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    legalId: v.optional(v.string()),
    legalIdType: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.any())),
  },
  returns: customerDoc,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("customers")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (args.email !== existing.email) patch.email = args.email;
      if (args.fullName !== undefined && args.fullName !== existing.fullName) {
        patch.fullName = args.fullName;
      }
      if (args.phoneNumber !== undefined && args.phoneNumber !== existing.phoneNumber) {
        patch.phoneNumber = args.phoneNumber;
      }
      if (args.legalId !== undefined) patch.legalId = args.legalId;
      if (args.legalIdType !== undefined) patch.legalIdType = args.legalIdType;
      if (args.metadata !== undefined) patch.metadata = args.metadata;

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch("customers", existing._id, patch);
      }
      return (await ctx.db.get("customers", existing._id))!;
    }

    const customerId = await ctx.db.insert("customers", args);
    return (await ctx.db.get("customers", customerId))!;
  },
});

export const getByUserId = query({
  args: { userId: v.string() },
  returns: v.union(customerDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customers")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();
  },
});
