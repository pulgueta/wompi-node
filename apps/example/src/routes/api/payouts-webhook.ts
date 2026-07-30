import { env } from "node:process";

import {
  isPayoutUpdatedEvent,
  verifyPayoutEvent,
} from "@pulgueta/wompi/server";
import { createFileRoute } from "@tanstack/react-router";

import { applyDispersionStatus } from "#/server/store";

/**
 * Receives Wompi's Payouts events (Eventos · Pagos a Terceros in the
 * dashboard), signed with WOMPI_PAYOUTS_EVENTS_KEY. A `payout.updated`
 * reaching TOTAL_PAYMENT settles the matching provider's pending balance
 * exactly once (the status poll applies the same transition when it wins
 * the race).
 */
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
          const { id, status, reference } = event.data.payout;
          applyDispersionStatus({ reference, wompiPayoutId: id }, status);
        }

        return Response.json({ received: true });
      },
    },
  },
});
