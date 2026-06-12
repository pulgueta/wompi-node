import { httpRouter } from "convex/server";
import { wompi } from "./wompi.js";

const http = httpRouter();

// Wompi events land on https://<deployment>.convex.site/wompi/webhook —
// configure that URL under "Eventos" (Sandbox) in the Wompi dashboard.
wompi.registerRoutes(http, {
  onEvent: async (_ctx, event) => {
    console.log(`[wompi] evento ${event.event} (${event.environment})`);
  },
});

export default http;
