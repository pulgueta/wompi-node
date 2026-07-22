import { expectTypeOf, test } from "vitest";
import {
  isPayoutTransactionUpdatedEvent,
  isPayoutUpdatedEvent,
  verifyPayoutEvent,
} from "../src/server";
import type { VerifyWebhookEventOptions } from "../src/server";
import type { PayoutEvent, Result } from "../src/schemas";

test("verifyPayoutEvent resolves the payout envelope and its guards narrow", async () => {
  const payload: unknown = {};
  const options = {} as VerifyWebhookEventOptions;

  const result = verifyPayoutEvent(payload, options);

  expectTypeOf(result).toEqualTypeOf<Promise<Result<PayoutEvent>>>();

  const [, event] = await result;
  if (!event) return;

  if (isPayoutUpdatedEvent(event)) {
    expectTypeOf(event.data.payout.status).toEqualTypeOf<string>();
  }

  if (isPayoutTransactionUpdatedEvent(event)) {
    expectTypeOf(event.data.transaction.payoutId).toEqualTypeOf<string>();
    expectTypeOf(event.data.transaction.payee.key).toEqualTypeOf<string | undefined>();
    expectTypeOf(event.data.transaction.payee.keyResolutionId).toEqualTypeOf<string | undefined>();
  }
});
