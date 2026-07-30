import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Raw markdown of every ingested doc, kept in file storage so agent tools
  // can read the full document without re-fetching or re-chunking.
  docs: defineTable({
    source: v.string(),
    title: v.string(),
    url: v.optional(v.string()),
    storageId: v.id("_storage"),
    chars: v.number(),
  }).index("by_source", ["source"]),
});
