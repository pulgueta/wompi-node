/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    billing: {
      applyTransaction: FunctionReference<
        "mutation",
        "internal",
        {
          amountInCents?: number;
          config: {
            leaseMs: number;
            maxRetries: number;
            onExhausted: "mark_unpaid" | "cancel";
            retryScheduleMs: Array<number>;
          };
          currency?: string;
          paymentMethodType?: string;
          reference: string;
          statusMessage?: string;
          wompiStatus: string;
          wompiTransactionId: string;
        },
        {
          note?: string;
          outcome: string;
          payment: {
            _creationTime: number;
            _id: string;
            amountInCents: number;
            attempt?: number;
            currency: string;
            customerId?: string;
            description?: string;
            failureReason?: string;
            finalizedAt?: number;
            kind: "checkout" | "subscription";
            metadata?: Record<string, any>;
            paymentMethodType?: string;
            periodEnd?: number;
            periodStart?: number;
            productId?: string;
            productKey?: string;
            reference: string;
            status:
              | "pending"
              | "approved"
              | "declined"
              | "voided"
              | "error"
              | "expired";
            subscriptionId?: string;
            userId: string;
            wompiTransactionId?: string;
          } | null;
          paymentChanged: boolean;
          subscription: {
            _creationTime: number;
            _id: string;
            amountInCents: number;
            cancelAtPeriodEnd: boolean;
            canceledAt?: number;
            currency: string;
            currentPeriodEnd: number;
            currentPeriodStart: number;
            customerId: string;
            endedAt?: number;
            failedAttempts: number;
            interval: "day" | "week" | "month" | "year";
            intervalCount: number;
            lastError?: string;
            metadata?: Record<string, any>;
            nextChargeAt?: number;
            paymentSourceId: string;
            pendingProductId?: string;
            pendingProductKey?: string;
            productId: string;
            productKey: string;
            status:
              | "incomplete"
              | "trialing"
              | "active"
              | "past_due"
              | "unpaid"
              | "canceled";
            trialEndsAt?: number;
            userId: string;
          } | null;
          subscriptionChanged: boolean;
        },
        Name
      >;
      claimDue: FunctionReference<
        "mutation",
        "internal",
        {
          batchSize?: number;
          config: {
            leaseMs: number;
            maxRetries: number;
            onExhausted: "mark_unpaid" | "cancel";
            retryScheduleMs: Array<number>;
          };
        },
        {
          claims: Array<{
            action: "charge" | "reconcile";
            customerEmail: string;
            payment: {
              _creationTime: number;
              _id: string;
              amountInCents: number;
              attempt?: number;
              currency: string;
              customerId?: string;
              description?: string;
              failureReason?: string;
              finalizedAt?: number;
              kind: "checkout" | "subscription";
              metadata?: Record<string, any>;
              paymentMethodType?: string;
              periodEnd?: number;
              periodStart?: number;
              productId?: string;
              productKey?: string;
              reference: string;
              status:
                | "pending"
                | "approved"
                | "declined"
                | "voided"
                | "error"
                | "expired";
              subscriptionId?: string;
              userId: string;
              wompiTransactionId?: string;
            };
            subscription: {
              _creationTime: number;
              _id: string;
              amountInCents: number;
              cancelAtPeriodEnd: boolean;
              canceledAt?: number;
              currency: string;
              currentPeriodEnd: number;
              currentPeriodStart: number;
              customerId: string;
              endedAt?: number;
              failedAttempts: number;
              interval: "day" | "week" | "month" | "year";
              intervalCount: number;
              lastError?: string;
              metadata?: Record<string, any>;
              nextChargeAt?: number;
              paymentSourceId: string;
              pendingProductId?: string;
              pendingProductKey?: string;
              productId: string;
              productKey: string;
              status:
                | "incomplete"
                | "trialing"
                | "active"
                | "past_due"
                | "unpaid"
                | "canceled";
              trialEndsAt?: number;
              userId: string;
            };
            wompiSourceId: number;
          }>;
          finalized: Array<{
            _creationTime: number;
            _id: string;
            amountInCents: number;
            cancelAtPeriodEnd: boolean;
            canceledAt?: number;
            currency: string;
            currentPeriodEnd: number;
            currentPeriodStart: number;
            customerId: string;
            endedAt?: number;
            failedAttempts: number;
            interval: "day" | "week" | "month" | "year";
            intervalCount: number;
            lastError?: string;
            metadata?: Record<string, any>;
            nextChargeAt?: number;
            paymentSourceId: string;
            pendingProductId?: string;
            pendingProductKey?: string;
            productId: string;
            productKey: string;
            status:
              | "incomplete"
              | "trialing"
              | "active"
              | "past_due"
              | "unpaid"
              | "canceled";
            trialEndsAt?: number;
            userId: string;
          }>;
        },
        Name
      >;
      recordChargeResult: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            leaseMs: number;
            maxRetries: number;
            onExhausted: "mark_unpaid" | "cancel";
            retryScheduleMs: Array<number>;
          };
          failureReason?: string;
          nextStatus:
            | "pending"
            | "approved"
            | "declined"
            | "voided"
            | "error"
            | "expired";
          paymentId: string;
          paymentMethodType?: string;
          wompiTransactionId?: string;
        },
        {
          note?: string;
          outcome: string;
          payment: {
            _creationTime: number;
            _id: string;
            amountInCents: number;
            attempt?: number;
            currency: string;
            customerId?: string;
            description?: string;
            failureReason?: string;
            finalizedAt?: number;
            kind: "checkout" | "subscription";
            metadata?: Record<string, any>;
            paymentMethodType?: string;
            periodEnd?: number;
            periodStart?: number;
            productId?: string;
            productKey?: string;
            reference: string;
            status:
              | "pending"
              | "approved"
              | "declined"
              | "voided"
              | "error"
              | "expired";
            subscriptionId?: string;
            userId: string;
            wompiTransactionId?: string;
          } | null;
          paymentChanged: boolean;
          subscription: {
            _creationTime: number;
            _id: string;
            amountInCents: number;
            cancelAtPeriodEnd: boolean;
            canceledAt?: number;
            currency: string;
            currentPeriodEnd: number;
            currentPeriodStart: number;
            customerId: string;
            endedAt?: number;
            failedAttempts: number;
            interval: "day" | "week" | "month" | "year";
            intervalCount: number;
            lastError?: string;
            metadata?: Record<string, any>;
            nextChargeAt?: number;
            paymentSourceId: string;
            pendingProductId?: string;
            pendingProductKey?: string;
            productId: string;
            productKey: string;
            status:
              | "incomplete"
              | "trialing"
              | "active"
              | "past_due"
              | "unpaid"
              | "canceled";
            trialEndsAt?: number;
            userId: string;
          } | null;
          subscriptionChanged: boolean;
        },
        Name
      >;
    };
    customers: {
      getByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          _creationTime: number;
          _id: string;
          email: string;
          fullName?: string;
          legalId?: string;
          legalIdType?: string;
          metadata?: Record<string, any>;
          phoneNumber?: string;
          userId: string;
        } | null,
        Name
      >;
      upsert: FunctionReference<
        "mutation",
        "internal",
        {
          email: string;
          fullName?: string;
          legalId?: string;
          legalIdType?: string;
          metadata?: Record<string, any>;
          phoneNumber?: string;
          userId: string;
        },
        {
          _creationTime: number;
          _id: string;
          email: string;
          fullName?: string;
          legalId?: string;
          legalIdType?: string;
          metadata?: Record<string, any>;
          phoneNumber?: string;
          userId: string;
        },
        Name
      >;
    };
    payments: {
      createCheckout: FunctionReference<
        "mutation",
        "internal",
        {
          amountInCents?: number;
          customerId: string;
          description?: string;
          metadata?: Record<string, any>;
          productKey?: string;
          reference: string;
          userId: string;
        },
        {
          _creationTime: number;
          _id: string;
          amountInCents: number;
          attempt?: number;
          currency: string;
          customerId?: string;
          description?: string;
          failureReason?: string;
          finalizedAt?: number;
          kind: "checkout" | "subscription";
          metadata?: Record<string, any>;
          paymentMethodType?: string;
          periodEnd?: number;
          periodStart?: number;
          productId?: string;
          productKey?: string;
          reference: string;
          status:
            | "pending"
            | "approved"
            | "declined"
            | "voided"
            | "error"
            | "expired";
          subscriptionId?: string;
          userId: string;
          wompiTransactionId?: string;
        },
        Name
      >;
      getByReference: FunctionReference<
        "query",
        "internal",
        { reference: string },
        {
          _creationTime: number;
          _id: string;
          amountInCents: number;
          attempt?: number;
          currency: string;
          customerId?: string;
          description?: string;
          failureReason?: string;
          finalizedAt?: number;
          kind: "checkout" | "subscription";
          metadata?: Record<string, any>;
          paymentMethodType?: string;
          periodEnd?: number;
          periodStart?: number;
          productId?: string;
          productKey?: string;
          reference: string;
          status:
            | "pending"
            | "approved"
            | "declined"
            | "voided"
            | "error"
            | "expired";
          subscriptionId?: string;
          userId: string;
          wompiTransactionId?: string;
        } | null,
        Name
      >;
      listByUser: FunctionReference<
        "query",
        "internal",
        { limit?: number; userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          amountInCents: number;
          attempt?: number;
          currency: string;
          customerId?: string;
          description?: string;
          failureReason?: string;
          finalizedAt?: number;
          kind: "checkout" | "subscription";
          metadata?: Record<string, any>;
          paymentMethodType?: string;
          periodEnd?: number;
          periodStart?: number;
          productId?: string;
          productKey?: string;
          reference: string;
          status:
            | "pending"
            | "approved"
            | "declined"
            | "voided"
            | "error"
            | "expired";
          subscriptionId?: string;
          userId: string;
          wompiTransactionId?: string;
        }>,
        Name
      >;
      listStalePending: FunctionReference<
        "query",
        "internal",
        { limit?: number; olderThanMs: number },
        Array<{
          _creationTime: number;
          _id: string;
          amountInCents: number;
          attempt?: number;
          currency: string;
          customerId?: string;
          description?: string;
          failureReason?: string;
          finalizedAt?: number;
          kind: "checkout" | "subscription";
          metadata?: Record<string, any>;
          paymentMethodType?: string;
          periodEnd?: number;
          periodStart?: number;
          productId?: string;
          productKey?: string;
          reference: string;
          status:
            | "pending"
            | "approved"
            | "declined"
            | "voided"
            | "error"
            | "expired";
          subscriptionId?: string;
          userId: string;
          wompiTransactionId?: string;
        }>,
        Name
      >;
    };
    products: {
      archive: FunctionReference<
        "mutation",
        "internal",
        { key: string },
        null,
        Name
      >;
      getByKey: FunctionReference<
        "query",
        "internal",
        { key: string },
        {
          _creationTime: number;
          _id: string;
          active: boolean;
          amountInCents: number;
          currency: string;
          description?: string;
          imageUrl?: string;
          interval?: "day" | "week" | "month" | "year";
          intervalCount?: number;
          key: string;
          metadata?: Record<string, any>;
          name: string;
          trialDays?: number;
          type: "one_time" | "subscription";
        } | null,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { includeInactive?: boolean },
        Array<{
          _creationTime: number;
          _id: string;
          active: boolean;
          amountInCents: number;
          currency: string;
          description?: string;
          imageUrl?: string;
          interval?: "day" | "week" | "month" | "year";
          intervalCount?: number;
          key: string;
          metadata?: Record<string, any>;
          name: string;
          trialDays?: number;
          type: "one_time" | "subscription";
        }>,
        Name
      >;
      sync: FunctionReference<
        "mutation",
        "internal",
        {
          archiveMissing?: boolean;
          products: Array<{
            amountInCents: number;
            currency?: string;
            description?: string;
            imageUrl?: string;
            interval?: "day" | "week" | "month" | "year";
            intervalCount?: number;
            key: string;
            metadata?: Record<string, any>;
            name: string;
            trialDays?: number;
            type: "one_time" | "subscription";
          }>;
        },
        Array<{
          _creationTime: number;
          _id: string;
          active: boolean;
          amountInCents: number;
          currency: string;
          description?: string;
          imageUrl?: string;
          interval?: "day" | "week" | "month" | "year";
          intervalCount?: number;
          key: string;
          metadata?: Record<string, any>;
          name: string;
          trialDays?: number;
          type: "one_time" | "subscription";
        }>,
        Name
      >;
    };
    subscriptions: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { immediately?: boolean; subscriptionId: string; userId: string },
        {
          _creationTime: number;
          _id: string;
          amountInCents: number;
          cancelAtPeriodEnd: boolean;
          canceledAt?: number;
          currency: string;
          currentPeriodEnd: number;
          currentPeriodStart: number;
          customerId: string;
          endedAt?: number;
          failedAttempts: number;
          interval: "day" | "week" | "month" | "year";
          intervalCount: number;
          lastError?: string;
          metadata?: Record<string, any>;
          nextChargeAt?: number;
          paymentSourceId: string;
          pendingProductId?: string;
          pendingProductKey?: string;
          productId: string;
          productKey: string;
          status:
            | "incomplete"
            | "trialing"
            | "active"
            | "past_due"
            | "unpaid"
            | "canceled";
          trialEndsAt?: number;
          userId: string;
        },
        Name
      >;
      changeProduct: FunctionReference<
        "mutation",
        "internal",
        { productKey: string; subscriptionId: string; userId: string },
        {
          _creationTime: number;
          _id: string;
          amountInCents: number;
          cancelAtPeriodEnd: boolean;
          canceledAt?: number;
          currency: string;
          currentPeriodEnd: number;
          currentPeriodStart: number;
          customerId: string;
          endedAt?: number;
          failedAttempts: number;
          interval: "day" | "week" | "month" | "year";
          intervalCount: number;
          lastError?: string;
          metadata?: Record<string, any>;
          nextChargeAt?: number;
          paymentSourceId: string;
          pendingProductId?: string;
          pendingProductKey?: string;
          productId: string;
          productKey: string;
          status:
            | "incomplete"
            | "trialing"
            | "active"
            | "past_due"
            | "unpaid"
            | "canceled";
          trialEndsAt?: number;
          userId: string;
        },
        Name
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          customerId: string;
          metadata?: Record<string, any>;
          paymentSource: {
            brand?: string;
            cardHolder?: string;
            expMonth?: string;
            expYear?: string;
            lastFour?: string;
            status: string;
            type: string;
            wompiSourceId: number;
          };
          productKey: string;
          userId: string;
        },
        {
          payment: {
            _creationTime: number;
            _id: string;
            amountInCents: number;
            attempt?: number;
            currency: string;
            customerId?: string;
            description?: string;
            failureReason?: string;
            finalizedAt?: number;
            kind: "checkout" | "subscription";
            metadata?: Record<string, any>;
            paymentMethodType?: string;
            periodEnd?: number;
            periodStart?: number;
            productId?: string;
            productKey?: string;
            reference: string;
            status:
              | "pending"
              | "approved"
              | "declined"
              | "voided"
              | "error"
              | "expired";
            subscriptionId?: string;
            userId: string;
            wompiTransactionId?: string;
          } | null;
          subscription: {
            _creationTime: number;
            _id: string;
            amountInCents: number;
            cancelAtPeriodEnd: boolean;
            canceledAt?: number;
            currency: string;
            currentPeriodEnd: number;
            currentPeriodStart: number;
            customerId: string;
            endedAt?: number;
            failedAttempts: number;
            interval: "day" | "week" | "month" | "year";
            intervalCount: number;
            lastError?: string;
            metadata?: Record<string, any>;
            nextChargeAt?: number;
            paymentSourceId: string;
            pendingProductId?: string;
            pendingProductKey?: string;
            productId: string;
            productKey: string;
            status:
              | "incomplete"
              | "trialing"
              | "active"
              | "past_due"
              | "unpaid"
              | "canceled";
            trialEndsAt?: number;
            userId: string;
          };
        },
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { subscriptionId: string },
        {
          _creationTime: number;
          _id: string;
          amountInCents: number;
          cancelAtPeriodEnd: boolean;
          canceledAt?: number;
          currency: string;
          currentPeriodEnd: number;
          currentPeriodStart: number;
          customerId: string;
          endedAt?: number;
          failedAttempts: number;
          interval: "day" | "week" | "month" | "year";
          intervalCount: number;
          lastError?: string;
          metadata?: Record<string, any>;
          nextChargeAt?: number;
          paymentSourceId: string;
          pendingProductId?: string;
          pendingProductKey?: string;
          product: {
            _creationTime: number;
            _id: string;
            active: boolean;
            amountInCents: number;
            currency: string;
            description?: string;
            imageUrl?: string;
            interval?: "day" | "week" | "month" | "year";
            intervalCount?: number;
            key: string;
            metadata?: Record<string, any>;
            name: string;
            trialDays?: number;
            type: "one_time" | "subscription";
          } | null;
          productId: string;
          productKey: string;
          status:
            | "incomplete"
            | "trialing"
            | "active"
            | "past_due"
            | "unpaid"
            | "canceled";
          trialEndsAt?: number;
          userId: string;
        } | null,
        Name
      >;
      getCurrent: FunctionReference<
        "query",
        "internal",
        { productKey?: string; userId: string },
        {
          _creationTime: number;
          _id: string;
          amountInCents: number;
          cancelAtPeriodEnd: boolean;
          canceledAt?: number;
          currency: string;
          currentPeriodEnd: number;
          currentPeriodStart: number;
          customerId: string;
          endedAt?: number;
          failedAttempts: number;
          interval: "day" | "week" | "month" | "year";
          intervalCount: number;
          lastError?: string;
          metadata?: Record<string, any>;
          nextChargeAt?: number;
          paymentSourceId: string;
          pendingProductId?: string;
          pendingProductKey?: string;
          product: {
            _creationTime: number;
            _id: string;
            active: boolean;
            amountInCents: number;
            currency: string;
            description?: string;
            imageUrl?: string;
            interval?: "day" | "week" | "month" | "year";
            intervalCount?: number;
            key: string;
            metadata?: Record<string, any>;
            name: string;
            trialDays?: number;
            type: "one_time" | "subscription";
          } | null;
          productId: string;
          productKey: string;
          status:
            | "incomplete"
            | "trialing"
            | "active"
            | "past_due"
            | "unpaid"
            | "canceled";
          trialEndsAt?: number;
          userId: string;
        } | null,
        Name
      >;
      listByUser: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          amountInCents: number;
          cancelAtPeriodEnd: boolean;
          canceledAt?: number;
          currency: string;
          currentPeriodEnd: number;
          currentPeriodStart: number;
          customerId: string;
          endedAt?: number;
          failedAttempts: number;
          interval: "day" | "week" | "month" | "year";
          intervalCount: number;
          lastError?: string;
          metadata?: Record<string, any>;
          nextChargeAt?: number;
          paymentSourceId: string;
          pendingProductId?: string;
          pendingProductKey?: string;
          product: {
            _creationTime: number;
            _id: string;
            active: boolean;
            amountInCents: number;
            currency: string;
            description?: string;
            imageUrl?: string;
            interval?: "day" | "week" | "month" | "year";
            intervalCount?: number;
            key: string;
            metadata?: Record<string, any>;
            name: string;
            trialDays?: number;
            type: "one_time" | "subscription";
          } | null;
          productId: string;
          productKey: string;
          status:
            | "incomplete"
            | "trialing"
            | "active"
            | "past_due"
            | "unpaid"
            | "canceled";
          trialEndsAt?: number;
          userId: string;
        }>,
        Name
      >;
      resume: FunctionReference<
        "mutation",
        "internal",
        { subscriptionId: string; userId: string },
        {
          _creationTime: number;
          _id: string;
          amountInCents: number;
          cancelAtPeriodEnd: boolean;
          canceledAt?: number;
          currency: string;
          currentPeriodEnd: number;
          currentPeriodStart: number;
          customerId: string;
          endedAt?: number;
          failedAttempts: number;
          interval: "day" | "week" | "month" | "year";
          intervalCount: number;
          lastError?: string;
          metadata?: Record<string, any>;
          nextChargeAt?: number;
          paymentSourceId: string;
          pendingProductId?: string;
          pendingProductKey?: string;
          productId: string;
          productKey: string;
          status:
            | "incomplete"
            | "trialing"
            | "active"
            | "past_due"
            | "unpaid"
            | "canceled";
          trialEndsAt?: number;
          userId: string;
        },
        Name
      >;
      setNextChargeAt: FunctionReference<
        "mutation",
        "internal",
        { at: number; subscriptionId: string },
        null,
        Name
      >;
    };
    webhooks: {
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { limit?: number; olderThanTimestamp: number },
        number,
        Name
      >;
      markOutcome: FunctionReference<
        "mutation",
        "internal",
        { eventId: string; outcome: string },
        null,
        Name
      >;
      recordEvent: FunctionReference<
        "mutation",
        "internal",
        {
          checksum: string;
          environment: string;
          eventType: string;
          reference?: string;
          sentAt?: string;
          timestamp: number;
          transactionId?: string;
        },
        { duplicate: boolean; eventId: string },
        Name
      >;
    };
  };
