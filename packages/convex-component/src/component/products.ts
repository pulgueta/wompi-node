import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { productDoc, productInputValidator } from "./shared.js";

/**
 * Upsert the developer-defined catalog by `key`. Existing products are
 * patched in place (new subscribers get the new price; existing
 * subscriptions keep their snapshot). With `archiveMissing`, products absent
 * from the list are deactivated.
 */
export const sync = mutation({
  args: {
    products: v.array(productInputValidator),
    archiveMissing: v.optional(v.boolean()),
  },
  returns: v.array(productDoc),
  handler: async (ctx, args) => {
    const keys = new Set(args.products.map((p) => p.key));
    const result = [];

    for (const input of args.products) {
      if (input.type === "subscription" && !input.interval) {
        throw new Error(
          `Product "${input.key}" is a subscription but has no billing interval`,
        );
      }

      const doc = {
        ...input,
        currency: input.currency ?? "COP",
        intervalCount:
          input.type === "subscription" ? (input.intervalCount ?? 1) : input.intervalCount,
        active: true,
      };

      const existing = await ctx.db
        .query("products")
        .withIndex("by_key", (q) => q.eq("key", input.key))
        .unique();

      if (existing) {
        await ctx.db.replace("products", existing._id, doc);
        result.push((await ctx.db.get("products", existing._id))!);
      } else {
        const id = await ctx.db.insert("products", doc);
        result.push((await ctx.db.get("products", id))!);
      }
    }

    if (args.archiveMissing) {
      const active = await ctx.db
        .query("products")
        .withIndex("by_active", (q) => q.eq("active", true))
        .take(1000);

      for (const product of active) {
        if (!keys.has(product.key)) {
          await ctx.db.patch("products", product._id, { active: false });
        }
      }
    }

    return result;
  },
});

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  returns: v.array(productDoc),
  handler: async (ctx, args) => {
    if (args.includeInactive) {
      return await ctx.db.query("products").take(1000);
    }
    return await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(1000);
  },
});

export const getByKey = query({
  args: { key: v.string() },
  returns: v.union(productDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
  },
});

export const archive = mutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const product = await ctx.db
      .query("products")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (product) {
      await ctx.db.patch("products", product._id, { active: false });
    }
    return null;
  },
});
