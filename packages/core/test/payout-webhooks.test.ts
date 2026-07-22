import { describe, it, expect } from "vitest";
import {
  computeEventChecksum,
  isPayoutTransactionUpdatedEvent,
  isPayoutUpdatedEvent,
  verifyPayoutEvent,
} from "../src/server";
import { WompiWebhookVerificationError } from "../src/schemas";
import type { PayoutEvent } from "../src/schemas";

/**
 * The transaction vector is the worked example of
 * https://docs.wompi.co/docs/colombia/eventos-pagos-a-terceros/ — SHA-256 of
 * "04a6e53d-a244-4140-ab9e-48fa541f9fe5FAILED75000001747673128600<secret>".
 */
const DOCS_EVENTS_KEY = "prod_events_7b193c8afd7b47949f90d443cb1e1742";
const TRANSACTION_CHECKSUM = "82f0e769716170e202edfd348f604bd8461cdeeb416594cde563a890215a5282";

const PAYOUT_EVENTS_KEY = "test_payout_events_key";
const PAYOUT_CHECKSUM = "5eb9d9dae4cc69b47f4ca23960eb2e51f045b83c546bdf16339e31d38e4680af";

const transactionEvent = (): PayoutEvent => ({
  event: "transaction.updated",
  data: {
    transaction: {
      id: "04a6e53d-a244-4140-ab9e-48fa541f9fe5",
      payoutId: "payout_12345",
      amountInCents: 7_500_000,
      status: "FAILED",
      payee: {
        name: "Juan Pérez",
        bank: "BANCOLOMBIA",
        accountNumber: "1234567890",
      },
      failureReason: {
        code: "C01",
        message: "La cuenta no existe o está inactiva",
      },
      currency: "COP",
    },
  },
  signature: {
    properties: ["transaction.id", "transaction.status", "transaction.amountInCents"],
    checksum: TRANSACTION_CHECKSUM,
  },
  timestamp: 1747673128600,
  sentAt: "2025-05-15T15:00:00.000Z",
});

const payoutEvent = (): PayoutEvent => ({
  event: "payout.updated",
  data: {
    payout: {
      id: "04a6e53d-a244-4140-ab9e-48fa541f9fe5",
      reference: "ref_98765",
      amountInCents: 7_500_000,
      paymentType: "PAYROLL",
      status: "TOTAL_PAYMENT",
      totalTransactions: 3,
      currency: "COP",
    },
  },
  signature: {
    properties: ["payout.id", "payout.status", "payout.amountInCents"],
    checksum: PAYOUT_CHECKSUM,
  },
  timestamp: 1747673128600,
  sentAt: "2025-05-15T15:00:00.000Z",
});

describe("verifyPayoutEvent", () => {
  it("verifies the documented transaction.updated example", async () => {
    const [error, event] = await verifyPayoutEvent(transactionEvent(), {
      eventsKey: DOCS_EVENTS_KEY,
    });

    expect(error).toBeNull();
    expect(event?.event).toBe("transaction.updated");
  });

  it("verifies a payout.updated event from a raw JSON body", async () => {
    const [error, event] = await verifyPayoutEvent(JSON.stringify(payoutEvent()), {
      eventsKey: PAYOUT_EVENTS_KEY,
    });

    expect(error).toBeNull();
    expect(event?.timestamp).toBe(1747673128600);
  });

  it("rejects a tampered event", async () => {
    const event = transactionEvent();
    (event.data.transaction as Record<string, unknown>).amountInCents = 9_999_999;

    const [error, data] = await verifyPayoutEvent(event, { eventsKey: DOCS_EVENTS_KEY });

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WompiWebhookVerificationError);
    expect(error!.message).toContain("checksum");
  });

  it("rejects an event signed with a different secret", async () => {
    const [error, data] = await verifyPayoutEvent(transactionEvent(), {
      eventsKey: "another_secret",
    });

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WompiWebhookVerificationError);
  });

  it.each(["", "   "])(
    "rejects an empty events secret even when the checksum uses it",
    async (eventsKey) => {
      const event = payoutEvent();
      event.signature.checksum = await computeEventChecksum(event, eventsKey);

      const [error, data] = await verifyPayoutEvent(event, { eventsKey });

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(WompiWebhookVerificationError);
      expect(error!.message).toContain("eventsKey");
    }
  );

  it("rejects a payload that is not valid JSON", async () => {
    const [error, data] = await verifyPayoutEvent("not-json{", { eventsKey: DOCS_EVENTS_KEY });

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WompiWebhookVerificationError);
    expect(error!.message).toContain("not valid JSON");
  });

  it("rejects a payload without the event envelope", async () => {
    const [error, data] = await verifyPayoutEvent(
      { hello: "world" },
      {
        eventsKey: DOCS_EVENTS_KEY,
      }
    );

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WompiWebhookVerificationError);
    expect(error!.message).toContain("Invalid webhook payload");
  });
});

describe("payout event guards", () => {
  it("narrows payout.updated events", async () => {
    const [, event] = await verifyPayoutEvent(payoutEvent(), { eventsKey: PAYOUT_EVENTS_KEY });

    expect(isPayoutUpdatedEvent(event!)).toBe(true);
    expect(isPayoutTransactionUpdatedEvent(event!)).toBe(false);

    if (isPayoutUpdatedEvent(event!)) {
      expect(event.data.payout.status).toBe("TOTAL_PAYMENT");
    }
  });

  it("narrows transaction.updated events, including the object failureReason", async () => {
    const [, event] = await verifyPayoutEvent(transactionEvent(), {
      eventsKey: DOCS_EVENTS_KEY,
    });

    expect(isPayoutTransactionUpdatedEvent(event!)).toBe(true);
    expect(isPayoutUpdatedEvent(event!)).toBe(false);

    if (isPayoutTransactionUpdatedEvent(event!)) {
      expect(event.data.transaction.status).toBe("FAILED");
      expect(event.data.transaction.payoutId).toBe("payout_12345");
      expect(event.data.transaction.payee.name).toBe("Juan Pérez");
      expect(event.data.transaction.failureReason).toMatchObject({ code: "C01" });
    }
  });

  it("narrows transaction.updated events with a document payee and no bank", () => {
    const event = transactionEvent();
    const transaction = event.data.transaction as Record<string, unknown>;

    // The official event example identifies the payee by `document`; BRE-B
    // events on the same URL omit `bank` and word failures as `description`.
    transaction.payee = {
      name: "Juan Pérez",
      document: "1000000000",
      accountType: "SAVINGS",
      accountNumber: "1234567890",
    };
    transaction.failureReason = { code: "EXC_037", description: "Entidad no disponible" };

    expect(isPayoutTransactionUpdatedEvent(event)).toBe(true);
  });
});
