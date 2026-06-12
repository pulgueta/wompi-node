import { describe, it, expect } from "vitest";
import { computeEventChecksum, isTransactionUpdatedEvent, verifyWebhookEvent } from "../src/server";
import { WompiWebhookVerificationError } from "../src/schemas";
import type { WebhookEvent } from "../src/schemas";

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
