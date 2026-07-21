import { expectTypeOf, test } from "vitest";
import {
  isPayoutTransactionUpdatedEvent,
  isPayoutUpdatedEvent,
  isTransactionUpdatedEvent,
  verifyWebhookEvent,
} from "../src/server";
import type { VerifyWebhookEventOptions } from "../src/server";
import type { PayoutWebhookEvent, Result, WebhookEvent } from "../src/schemas";

test("supports runtime-selected webhook APIs and guard composition", async () => {
  const payload: unknown = {};
  const options = {} as VerifyWebhookEventOptions;

  const result = verifyWebhookEvent(payload, options);

  expectTypeOf(result).toEqualTypeOf<Promise<Result<WebhookEvent | PayoutWebhookEvent>>>();

  const [, event] = await result;
  if (!event) return;

  isTransactionUpdatedEvent(event);
  isPayoutTransactionUpdatedEvent(event);
  isPayoutUpdatedEvent(event);
});
