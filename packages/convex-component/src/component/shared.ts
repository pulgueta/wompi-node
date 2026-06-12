import { v } from "convex/values";
import type { Infer } from "convex/values";
import schema from "./schema.js";

// ---------------------------------------------------------------------------
// Document validators (schema fields + system fields) for cross-boundary
// returns. App-side, `v.id(...)` values surface as plain strings.
// ---------------------------------------------------------------------------

export const customerDoc = v.object({
  ...schema.tables.customers.validator.fields,
  _id: v.id("customers"),
  _creationTime: v.number(),
});

export const productDoc = v.object({
  ...schema.tables.products.validator.fields,
  _id: v.id("products"),
  _creationTime: v.number(),
});

export const paymentSourceDoc = v.object({
  ...schema.tables.paymentSources.validator.fields,
  _id: v.id("paymentSources"),
  _creationTime: v.number(),
});

export const subscriptionDoc = v.object({
  ...schema.tables.subscriptions.validator.fields,
  _id: v.id("subscriptions"),
  _creationTime: v.number(),
});

export const paymentDoc = v.object({
  ...schema.tables.payments.validator.fields,
  _id: v.id("payments"),
  _creationTime: v.number(),
});

export const subscriptionWithProduct = v.object({
  ...subscriptionDoc.fields,
  product: v.union(productDoc, v.null()),
});

// ---------------------------------------------------------------------------
// Billing configuration, threaded into mutations from the client class so the
// component never stores app configuration (or secrets) of its own.
// ---------------------------------------------------------------------------

export const billingConfigValidator = v.object({
  /** Dunning retries after a failed renewal before giving up. */
  maxRetries: v.number(),
  /** Delay before each dunning retry, in ms; the last entry repeats. */
  retryScheduleMs: v.array(v.number()),
  /** What to do once dunning is exhausted. */
  onExhausted: v.union(v.literal("mark_unpaid"), v.literal("cancel")),
  /** How long a claimed charge stays leased before the cron may retry it. */
  leaseMs: v.number(),
});

export type BillingConfig = Infer<typeof billingConfigValidator>;

export const productInputValidator = v.object({
  key: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  type: schema.tables.products.validator.fields.type,
  amountInCents: v.number(),
  currency: v.optional(v.string()),
  interval: v.optional(schema.tables.subscriptions.validator.fields.interval),
  intervalCount: v.optional(v.number()),
  trialDays: v.optional(v.number()),
  metadata: v.optional(v.record(v.string(), v.any())),
});

export const paymentSourceInputValidator = v.object({
  wompiSourceId: v.number(),
  type: v.string(),
  status: v.string(),
  brand: v.optional(v.string()),
  lastFour: v.optional(v.string()),
  expMonth: v.optional(v.string()),
  expYear: v.optional(v.string()),
  cardHolder: v.optional(v.string()),
});

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export type PaymentStatus = Infer<typeof schema.tables.payments.validator.fields.status>;
export type SubscriptionStatus = Infer<typeof schema.tables.subscriptions.validator.fields.status>;
export type Interval = Infer<typeof schema.tables.subscriptions.validator.fields.interval>;

/** Wompi transaction statuses mapped to payment row statuses. */
export const WOMPI_STATUS_TO_PAYMENT_STATUS: Record<string, PaymentStatus> = {
  APPROVED: "approved",
  DECLINED: "declined",
  VOIDED: "voided",
  ERROR: "error",
  PENDING: "pending",
};

/** Statuses during which the user keeps access (past_due = dunning grace). */
export const ENTITLED_STATUSES: SubscriptionStatus[] = ["active", "trialing", "past_due"];

/** Statuses the billing cron is allowed to charge. */
export const CHARGEABLE_STATUSES: SubscriptionStatus[] = ["active", "trialing", "past_due"];

export const isTerminalPaymentStatus = (status: PaymentStatus): boolean =>
  status !== "pending";

// ---------------------------------------------------------------------------
// Period math
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/**
 * Advance a timestamp by a billing interval. Month/year math is calendar-aware
 * in UTC with end-of-month clamping (Jan 31 + 1 month = Feb 28/29), matching
 * how Stripe anchors billing cycles.
 */
export const addInterval = (fromMs: number, interval: Interval, count: number): number => {
  switch (interval) {
    case "day":
      return fromMs + count * DAY_MS;
    case "week":
      return fromMs + count * 7 * DAY_MS;
    case "month":
    case "year": {
      const months = interval === "year" ? count * 12 : count;
      const from = new Date(fromMs);
      const target = new Date(
        Date.UTC(
          from.getUTCFullYear(),
          from.getUTCMonth() + months,
          1,
          from.getUTCHours(),
          from.getUTCMinutes(),
          from.getUTCSeconds(),
          from.getUTCMilliseconds(),
        ),
      );
      const daysInTargetMonth = new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
      ).getUTCDate();
      target.setUTCDate(Math.min(from.getUTCDate(), daysInTargetMonth));
      return target.getTime();
    }
  }
};

// ---------------------------------------------------------------------------
// References — the idempotency anchor shared with Wompi. Wompi enforces
// reference uniqueness, so a deterministic reference per (subscription,
// period, attempt) makes double charges structurally impossible.
// ---------------------------------------------------------------------------

export const subscriptionChargeReference = (
  subscriptionId: string,
  periodKey: string | number,
  attempt: number,
): string => `wmps_${subscriptionId}_${periodKey}_a${attempt}`;

export const retryDelayMs = (config: BillingConfig, failedAttempts: number): number => {
  const schedule = config.retryScheduleMs;
  if (schedule.length === 0) return DAY_MS;
  return schedule[Math.min(failedAttempts - 1, schedule.length - 1)];
};
