import { env } from "node:process";

import {
  isPayoutTransactionUpdatedEvent,
  isPayoutUpdatedEvent,
  verifyPayoutEvent,
} from "@pulgueta/wompi/server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/payouts-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const [error, event] = await verifyPayoutEvent(rawBody, {
          eventsKey: env.WOMPI_PAYOUTS_EVENTS_KEY ?? "",
        });

        if (error) {
          return new Response("Invalid payout event", { status: 403 });
        }

        if (isPayoutUpdatedEvent(event)) {
          const { id, status } = event.data.payout;
          console.log("Wompi payout.updated", { id, status });
        } else if (isPayoutTransactionUpdatedEvent(event)) {
          const { id, status } = event.data.transaction;
          console.log("Wompi transaction.updated", { id, status });
        }

        return Response.json({ received: true });
      },
    },
  },
});
