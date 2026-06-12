import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const productTypeValidator = v.union(
  v.literal("one_time"),
  v.literal("subscription"),
);

export const intervalValidator = v.union(
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
  v.literal("year"),
);

export const subscriptionStatusValidator = v.union(
  // Created, first charge not approved yet.
  v.literal("incomplete"),
  v.literal("trialing"),
  v.literal("active"),
  // A renewal charge failed; dunning retries are in progress.
  v.literal("past_due"),
  // Dunning exhausted; access should be revoked.
  v.literal("unpaid"),
  v.literal("canceled"),
);

export const paymentStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("voided"),
  v.literal("error"),
  // A pending payment nothing ever resolved (e.g. abandoned checkout).
  v.literal("expired"),
);

export const paymentKindValidator = v.union(
  v.literal("checkout"),
  v.literal("subscription"),
);

export default defineSchema({
  // App users mapped into the billing domain. Wompi has no customer object,
  // so this table is the source of truth.
  customers: defineTable({
    userId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    legalId: v.optional(v.string()),
    legalIdType: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.any())),
  })
    .index("by_user_id", ["userId"])
    .index("by_email", ["email"]),

  // Developer-defined catalog. Wompi has no product/price API, so the
  // component owns it; subscription products embed their billing interval.
  products: defineTable({
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    type: productTypeValidator,
    amountInCents: v.number(),
    currency: v.string(),
    interval: v.optional(intervalValidator),
    intervalCount: v.optional(v.number()),
    trialDays: v.optional(v.number()),
    active: v.boolean(),
    metadata: v.optional(v.record(v.string(), v.any())),
  })
    .index("by_key", ["key"])
    .index("by_active", ["active"]),

  // Tokenized payment methods saved as Wompi payment sources, charged
  // server-side on renewals.
  paymentSources: defineTable({
    customerId: v.id("customers"),
    userId: v.string(),
    wompiSourceId: v.number(),
    type: v.string(),
    status: v.string(),
    brand: v.optional(v.string()),
    lastFour: v.optional(v.string()),
    expMonth: v.optional(v.string()),
    expYear: v.optional(v.string()),
    cardHolder: v.optional(v.string()),
  })
    .index("by_customer_id", ["customerId"])
    .index("by_user_id", ["userId"])
    .index("by_wompi_source_id", ["wompiSourceId"]),

  // The billing engine's state machine. Wompi has no native subscriptions:
  // periods, renewals and dunning are computed here.
  subscriptions: defineTable({
    customerId: v.id("customers"),
    userId: v.string(),
    productId: v.id("products"),
    productKey: v.string(),
    paymentSourceId: v.id("paymentSources"),
    status: subscriptionStatusValidator,
    // Price snapshot at subscribe time; product price changes only affect
    // new subscribers.
    amountInCents: v.number(),
    currency: v.string(),
    interval: intervalValidator,
    intervalCount: v.number(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    // When the billing cron should look at this subscription again
    // (renewal, trial conversion, dunning retry or cancel finalization).
    nextChargeAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    canceledAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    trialEndsAt: v.optional(v.number()),
    failedAttempts: v.number(),
    lastError: v.optional(v.string()),
    // Scheduled plan change, applied at the next renewal (no proration).
    pendingProductId: v.optional(v.id("products")),
    pendingProductKey: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.any())),
  })
    .index("by_user_id", ["userId"])
    .index("by_customer_id", ["customerId"])
    .index("by_next_charge_at", ["nextChargeAt"]),

  // One row per charge attempt (checkouts, initial charges, renewals).
  // `reference` is the idempotency anchor shared with Wompi.
  payments: defineTable({
    reference: v.string(),
    kind: paymentKindValidator,
    status: paymentStatusValidator,
    customerId: v.optional(v.id("customers")),
    userId: v.string(),
    productId: v.optional(v.id("products")),
    productKey: v.optional(v.string()),
    subscriptionId: v.optional(v.id("subscriptions")),
    amountInCents: v.number(),
    currency: v.string(),
    description: v.optional(v.string()),
    attempt: v.optional(v.number()),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
    wompiTransactionId: v.optional(v.string()),
    paymentMethodType: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    finalizedAt: v.optional(v.number()),
    metadata: v.optional(v.record(v.string(), v.any())),
  })
    .index("by_reference", ["reference"])
    .index("by_user_id", ["userId"])
    .index("by_subscription_id", ["subscriptionId"])
    .index("by_wompi_transaction_id", ["wompiTransactionId"])
    .index("by_status", ["status"]),

  // Verified webhook deliveries, keyed by Wompi's checksum for exactly-once
  // processing of app callbacks (Wompi retries up to 3 times).
  webhookEvents: defineTable({
    checksum: v.string(),
    eventType: v.string(),
    environment: v.string(),
    timestamp: v.number(),
    sentAt: v.optional(v.string()),
    transactionId: v.optional(v.string()),
    reference: v.optional(v.string()),
    outcome: v.optional(v.string()),
  })
    .index("by_checksum", ["checksum"])
    .index("by_timestamp", ["timestamp"]),
});
