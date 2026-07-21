import { describe, it, expect } from "vitest";
import {
  computeEventChecksum,
  isPayoutTransactionUpdatedEvent,
  isPayoutUpdatedEvent,
  isTransactionUpdatedEvent,
  verifyWebhookEvent,
} from "../src/server";
import type { VerifyWebhookEventOptions } from "../src/server";
import { WompiWebhookVerificationError } from "../src/schemas";
import type { PayoutWebhookEvent, WebhookEvent } from "../src/schemas";

const EVENTS_KEY = "test_events_EqCPDEn5x4lRatGPxLhyZd6YTgd6QSrr";

/**
 * Checksum vectors are SHA-256 hex digests computed independently of the SDK:
 *   printf '%s' "<property values><timestamp><eventsKey>" | shasum -a 256
 */
const VALID_CHECKSUM = "c7c03147429efbbcfab3cdf585041c871d577ca183b1387581535add1a061780";

const transactionEvent = (overrides: Partial<WebhookEvent> = {}): WebhookEvent => ({
  event: "transaction.updated",
  data: {
    transaction: {
      id: "1234-1610641025-49201",
      status: "APPROVED",
      reference: "order-42",
      amount_in_cents: 4_490_000,
    },
  },
  environment: "test",
  signature: {
    properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
    checksum: VALID_CHECKSUM,
  },
  timestamp: 1530291411,
  sent_at: "2018-07-20T16:45:05.000Z",
  ...overrides,
});

describe("computeEventChecksum", () => {
  it("hashes <property values><timestamp><eventsKey>", async () => {
    const checksum = await computeEventChecksum(transactionEvent(), EVENTS_KEY);

    // SHA-256 of "1234-1610641025-49201APPROVED44900001530291411test_events_EqCPDEn5x4lRatGPxLhyZd6YTgd6QSrr"
    expect(checksum).toBe(VALID_CHECKSUM);
  });

  it("treats missing signature properties as empty strings", async () => {
    const event = transactionEvent();
    event.signature = {
      properties: ["transaction.does_not_exist", "transaction.status"],
      checksum: "",
    };

    const checksum = await computeEventChecksum(event, "test_events_key");

    // SHA-256 of "APPROVED1530291411test_events_key" — the missing property contributes nothing.
    expect(checksum).toBe("311fcd0072d0bfba1bdf8c158b38703a1487d7f4866feb2d391eceb7636ffe88");
  });
});

describe("verifyWebhookEvent", () => {
  it("verifies a valid event object", async () => {
    const [error, event] = await verifyWebhookEvent(transactionEvent(), {
      eventsKey: EVENTS_KEY,
    });

    expect(error).toBeNull();
    expect(event?.event).toBe("transaction.updated");
  });

  it("verifies a raw JSON request body", async () => {
    const [error, event] = await verifyWebhookEvent(JSON.stringify(transactionEvent()), {
      eventsKey: EVENTS_KEY,
    });

    expect(error).toBeNull();
    expect(event?.timestamp).toBe(1530291411);
  });

  it("accepts Wompi's uppercase hex checksums", async () => {
    const event = transactionEvent();
    event.signature.checksum = VALID_CHECKSUM.toUpperCase();

    const [error] = await verifyWebhookEvent(event, { eventsKey: EVENTS_KEY });

    expect(error).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const event = transactionEvent();
    (event.data.transaction as { amount_in_cents: number }).amount_in_cents = 100;

    const [error, verified] = await verifyWebhookEvent(event, { eventsKey: EVENTS_KEY });

    expect(error).toBeInstanceOf(WompiWebhookVerificationError);
    expect(verified).toBeNull();
  });

  it("rejects an event signed with a different events key", async () => {
    const [error] = await verifyWebhookEvent(transactionEvent(), {
      eventsKey: "wrong_key",
    });

    expect(error).toBeInstanceOf(WompiWebhookVerificationError);
  });

  it("rejects a body that is not valid JSON", async () => {
    const [error] = await verifyWebhookEvent("not-json{", { eventsKey: EVENTS_KEY });

    expect(error).toBeInstanceOf(WompiWebhookVerificationError);
    expect(error?.message).toMatch(/not valid JSON/);
  });

  it("rejects payloads missing the event envelope fields", async () => {
    const [error] = await verifyWebhookEvent(
      { event: "transaction.updated" },
      {
        eventsKey: EVENTS_KEY,
      }
    );

    expect(error).toBeInstanceOf(WompiWebhookVerificationError);
    expect(error?.message).toMatch(/Invalid webhook payload/);
  });

  it("rejects a payments event that omits environment", async () => {
    const event = transactionEvent();
    delete (event as Partial<WebhookEvent>).environment;

    const [error, verified] = await verifyWebhookEvent(event, { eventsKey: EVENTS_KEY });

    expect(error).toBeInstanceOf(WompiWebhookVerificationError);
    expect(verified).toBeNull();
  });
});

/**
 * Payouts (BRE-B) events differ from payments-API events: no `environment`
 * field and camelCase `sentAt`. Checksum vectors computed the same way as
 * above, over <property values><timestamp><eventsKey>.
 */
const PAYOUT_TX_CHECKSUM = "ade7ad572b2328d6492c29e1ccbc9d69f4b1ef5481620b05c294d56fb2222aaf";
const PAYOUT_CHECKSUM = "770db8e0cd4c6d3fe398dcc732bdfdcb058986e0b511c18c41debc193d8a953c";

const payoutTransactionEvent = (): PayoutWebhookEvent => ({
  event: "transaction.updated",
  data: {
    transaction: {
      id: "7ee824ed-6450-49d8-8b4c-cca181414f5f",
      payoutId: "c57a05b0-646c-11f1-8436-6ca5ce550b83",
      amountInCents: 150_000,
      status: "APPROVED",
      payee: {
        key: "@juanperez",
        name: "Juan Perez",
        email: "juan@example.com",
        keyType: "ALPHANUMERIC",
        keyResolutionId: "d7ed17c1-757d-22f2-93c2-2cc1f5c52b2a",
        paymentMethodType: "SAVING_ACCOUNT",
      },
      currency: "COP",
    },
  },
  signature: {
    properties: ["transaction.id", "transaction.status", "transaction.amountInCents"],
    checksum: PAYOUT_TX_CHECKSUM,
  },
  timestamp: 1781055930000,
  sentAt: "2026-06-10T02:15:30.500Z",
});

const payoutUpdatedEvent = (): PayoutWebhookEvent => ({
  event: "payout.updated",
  data: {
    payout: {
      id: "c57a05b0-646c-11f1-8436-6ca5ce550b83",
      reference: "payout-breb-001",
      amountInCents: 150_000,
      paymentType: "PROVIDERS",
      status: "TOTAL_PAYMENT",
      totalTransactions: 1,
      currency: "COP",
    },
  },
  signature: {
    properties: ["payout.id", "payout.status", "payout.amountInCents"],
    checksum: PAYOUT_CHECKSUM,
  },
  timestamp: 1781056530000,
  sentAt: "2026-06-15T10:05:30.500Z",
});

describe("verifyWebhookEvent · payouts (BRE-B) events", () => {
  it("verifies a payouts transaction.updated event, which has no environment field", async () => {
    const [error, event] = await verifyWebhookEvent(payoutTransactionEvent(), {
      eventsKey: EVENTS_KEY,
      api: "payouts",
    });

    expect(error).toBeNull();
    expect(event?.event).toBe("transaction.updated");
  });

  it("verifies a payout.updated event", async () => {
    const [error, event] = await verifyWebhookEvent(payoutUpdatedEvent(), {
      eventsKey: EVENTS_KEY,
      api: "payouts",
    });

    expect(error).toBeNull();
    expect(event?.event).toBe("payout.updated");
  });

  it("rejects a tampered payout amount", async () => {
    const event = payoutUpdatedEvent();
    (event.data.payout as { amountInCents: number }).amountInCents = 999;

    const [error] = await verifyWebhookEvent(event, { eventsKey: EVENTS_KEY, api: "payouts" });

    expect(error).toBeInstanceOf(WompiWebhookVerificationError);
  });

  it("supports runtime-selected API options and guard composition", async () => {
    const options: VerifyWebhookEventOptions = {
      eventsKey: EVENTS_KEY,
      api: "payouts",
    };

    const [error, event] = await verifyWebhookEvent(payoutTransactionEvent(), options);

    expect(error).toBeNull();
    expect(event).not.toBeNull();
    if (!event) return;

    expect(isPayoutTransactionUpdatedEvent(event) || isTransactionUpdatedEvent(event)).toBe(true);
  });
});

describe("isPayoutTransactionUpdatedEvent", () => {
  it("narrows payouts transaction.updated events", () => {
    const event = payoutTransactionEvent();

    expect(isPayoutTransactionUpdatedEvent(event)).toBe(true);

    if (isPayoutTransactionUpdatedEvent(event)) {
      expect(event.data.transaction.payoutId).toBe("c57a05b0-646c-11f1-8436-6ca5ce550b83");
      expect(event.data.transaction.payee?.key).toBe("@juanperez");
    }
  });

  it("returns false for payments-API transaction.updated events (no payoutId)", () => {
    expect(isPayoutTransactionUpdatedEvent(transactionEvent())).toBe(false);
  });

  it("does not let payouts events pass the payments-API guard", () => {
    expect(isTransactionUpdatedEvent(payoutTransactionEvent())).toBe(false);
  });

  it("returns false for other event types", () => {
    expect(isPayoutTransactionUpdatedEvent(payoutUpdatedEvent())).toBe(false);
  });
});

describe("isPayoutUpdatedEvent", () => {
  it("narrows payout.updated events", () => {
    const event = payoutUpdatedEvent();

    expect(isPayoutUpdatedEvent(event)).toBe(true);

    if (isPayoutUpdatedEvent(event)) {
      expect(event.data.payout.status).toBe("TOTAL_PAYMENT");
    }
  });

  it("returns false for other event types", () => {
    expect(isPayoutUpdatedEvent(payoutTransactionEvent())).toBe(false);
  });

  it("returns false when the payout payload is malformed", () => {
    const event = payoutUpdatedEvent();
    event.data = { payout: { id: "x" } };

    expect(isPayoutUpdatedEvent(event)).toBe(false);
  });
});

describe("isTransactionUpdatedEvent", () => {
  it("narrows transaction.updated events", () => {
    const event = transactionEvent();

    expect(isTransactionUpdatedEvent(event)).toBe(true);

    if (isTransactionUpdatedEvent(event)) {
      expect(event.data.transaction.status).toBe("APPROVED");
    }
  });

  it("returns false for other event types", () => {
    const event = transactionEvent({ event: "nequi_token.updated" });

    expect(isTransactionUpdatedEvent(event)).toBe(false);
  });

  it("returns false when the transaction payload is malformed", () => {
    const event = transactionEvent({ data: { transaction: { id: "x" } } });

    expect(isTransactionUpdatedEvent(event)).toBe(false);
  });
});
