/// <reference types="vite/client" />
import { test } from "vitest";
import {
  defineSchema,
  defineTable,
  internalMutationGeneric,
  makeFunctionReference,
  type GenericDataModel,
  type GenericMutationCtx,
} from "convex/server";
import { v } from "convex/values";
import { paymentChangeArgs } from "../component/shared.js";
import type { WompiEventCallbacks } from "./index.js";

/**
 * The app the client tests run as. It lives in its own module because
 * `import.meta.glob` (in `setup.test.ts`) never includes the module that calls
 * it, and convex-test can only resolve a function handle to a globbed module.
 */
export const appSchema = defineSchema({
  creditLedger: defineTable({
    reference: v.string(),
    status: v.string(),
    previousStatus: v.string(),
    userId: v.string(),
    amountInCents: v.number(),
    orderId: v.optional(v.string()),
  }).index("by_reference", ["reference"]),
  dispersionLog: defineTable({
    wompiPayoutId: v.string(),
    status: v.string(),
  }),
  /** A test appends to this table to make the next callbacks throw, or stop. */
  callbackControl: defineTable({ fail: v.boolean() }),
});

const shouldFail = async (ctx: GenericMutationCtx<GenericDataModel>) => {
  const control = await ctx.db.query("callbackControl").order("desc").first();
  return control?.fail === true;
};

/** The app's durable payment callback, run inside the component's transaction. */
export const onPaymentChange = internalMutationGeneric({
  args: paymentChangeArgs,
  returns: v.null(),
  handler: async (ctx, { payment, previousStatus }) => {
    const orderId = payment.metadata?.orderId;
    await ctx.db.insert("creditLedger", {
      reference: payment.reference,
      status: payment.status,
      previousStatus,
      userId: payment.userId,
      amountInCents: payment.amountInCents,
      orderId: typeof orderId === "string" ? orderId : undefined,
    });
    if (await shouldFail(ctx)) throw new Error("credits callback failed");
    return null;
  },
});

/** The dispersion callback, declared exactly as the README tells apps to. */
export const onDispersionChange = internalMutationGeneric({
  args: {
    dispersion: v.object({
      wompiPayoutId: v.string(),
      reference: v.string(),
      status: v.string(),
      paymentType: v.string(),
      transactionsTotal: v.number(),
      transactionsSuccess: v.number(),
      transactionsFailed: v.number(),
      amountInCents: v.optional(v.number()),
      finalizedAt: v.optional(v.number()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { dispersion }) => {
    await ctx.db.insert("dispersionLog", {
      wompiPayoutId: dispersion.wompiPayoutId,
      status: dispersion.status,
    });
    if (await shouldFail(ctx)) throw new Error("dispersion callback failed");
    return null;
  },
});

/**
 * References to the two callbacks above, addressed by the udf path convex-test
 * derives from this module's glob key — the same thing an app writes as
 * `internal.<module>.<fn>`.
 */
export const paymentCallback = makeFunctionReference<"mutation">(
  "callbacks.test:onPaymentChange",
) as unknown as NonNullable<WompiEventCallbacks["onPaymentChange"]>;

export const dispersionCallback = makeFunctionReference<"mutation">(
  "callbacks.test:onDispersionChange",
) as unknown as NonNullable<WompiEventCallbacks["onDispersionChange"]>;

test("app callbacks module", () => {});
