import type { APIRoute } from "astro";
import { WompiClient } from "@pulgueta/wompi";
import { getSignatureKey } from "@pulgueta/wompi/server";
import { checkRateLimit } from "@/lib/ratelimit";
import { readCredentialHeaders } from "@/lib/wompi-credentials";

// Live endpoint — opt out of prerendering so it runs on every request.
export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    // Responses echo the visitor's own sandbox data — never cache them.
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * Runs a full card checkout against the Wompi sandbox:
 *   1. read the merchant's presigned acceptance token
 *   2. tokenize the card
 *   3. compute the integrity signature
 *   4. create the transaction
 */
export const POST: APIRoute = async ({ request }) => {
  const rateLimited = await checkRateLimit(request, "checkout");
  if (rateLimited) return rateLimited;

  // The visitor supplies their own sandbox keys; they travel as request headers
  // and are used only for this call — never read from env, persisted or logged.
  const { publicKey, privateKey, integrityKey } = readCredentialHeaders(request);
  if (!publicKey || !privateKey || !integrityKey) {
    return json({
      configured: false,
      message: "Add your own Wompi sandbox public, private and integrity keys to run this example.",
    });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Request body must be valid JSON." }, 400);
  }

  const card = body.card as Record<string, string> | undefined;
  const customerEmail = String(body.customerEmail ?? "");
  const amountInCents = Number(body.amountInCents);
  const installments = Number(body.installments) || 1;

  if (!card || !Number.isInteger(amountInCents) || amountInCents < 1) {
    return json({ ok: false, error: "A card and a whole `amountInCents` are required." }, 400);
  }

  const wompi = new WompiClient({
    publicKey,
    privateKey,
    sandbox: true,
  });

  // 1. Acceptance token — proof the customer accepted the merchant's terms.
  const [merchantError, merchant] = await wompi.merchants.getMerchant();
  if (merchantError) {
    return json({ ok: false, step: "merchant", error: merchantError.message }, 502);
  }

  const acceptanceToken = merchant.presigned_acceptance?.acceptance_token;
  if (!acceptanceToken) {
    return json({ ok: false, step: "merchant", error: "Merchant has no acceptance token." }, 502);
  }

  // 2. Tokenize the card so its raw number never touches the transaction call.
  const [tokenError, token] = await wompi.tokens.tokenizeCard(card);
  if (tokenError) {
    return json({ ok: false, step: "tokenize", error: tokenError.message }, 422);
  }

  // 3. Sign the reference + amount with the integrity secret.
  const reference = `docs-demo-${Date.now()}`;
  const signature = await getSignatureKey({
    reference,
    amountInCents,
    integrityKey,
  });

  // 4. Create the transaction.
  const [transactionError, transaction] = await wompi.transactions.createTransaction({
    acceptance_token: acceptanceToken,
    amount_in_cents: amountInCents,
    currency: "COP",
    signature,
    customer_email: customerEmail,
    reference,
    payment_method: { type: "CARD", token: token.id, installments },
  });
  if (transactionError) {
    return json({ ok: false, step: "transaction", error: transactionError.message }, 422);
  }

  const t = transaction;
  return json({
    ok: true,
    configured: true,
    transaction: {
      id: t.id,
      status: t.status,
      reference: t.reference,
      amountInCents: t.amount_in_cents ?? amountInCents,
      paymentMethodType: t.payment_method_type ?? "CARD",
      statusMessage: t.status_message ?? null,
      createdAt: t.created_at ?? null,
    },
    card: {
      brand: token.brand ?? null,
      lastFour: token.last_four ?? null,
    },
  });
};
