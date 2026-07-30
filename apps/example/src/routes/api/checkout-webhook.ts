import { env } from "node:process";

import {
  isTransactionUpdatedEvent,
  verifyWebhookEvent,
} from "@pulgueta/wompi/server";
import { createFileRoute } from "@tanstack/react-router";

import { applyPaymentStatus } from "#/server/store";

/**
 * Receives Wompi's `transaction.updated` events (Eventos · Payments in the
 * dashboard). The checksum is verified with WOMPI_EVENTS_KEY before the
 * payload is trusted; the order's payment state then flips to its final
 * status, which the checkout result dialog is polling for.
 */
export const Route = createFileRoute("/api/checkout-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const [error, event] = await verifyWebhookEvent(rawBody, {
          eventsKey: env.WOMPI_EVENTS_KEY ?? "",
        });

        if (error) {
          return new Response("Invalid event", { status: 403 });
        }

        if (isTransactionUpdatedEvent(event)) {
          const transaction = event.data.transaction;
          applyPaymentStatus(transaction.reference, {
            status: transaction.status,
            transactionId: transaction.id,
            source: "webhook",
          });
        }

        return Response.json({ received: true });
      },
    },
  },
});
