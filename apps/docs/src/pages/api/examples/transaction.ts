import type { APIRoute } from "astro";
import { WompiClient } from "@pulgueta/wompi";
import { checkRateLimit } from "@/lib/ratelimit";
import { readCredentialHeaders } from "@/lib/wompi-credentials";

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    // Responses echo the visitor's own sandbox data — never cache them.
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/** Looks up a single transaction by id — used to poll a pending status. */
export const GET: APIRoute = async ({ request, url }) => {
  const rateLimited = await checkRateLimit(request, "transaction");
  if (rateLimited) return rateLimited;

  // The visitor supplies their own sandbox key via request headers — never env.
  const { publicKey } = readCredentialHeaders(request);
  if (!publicKey) {
    return json({
      configured: false,
      message: "Add your own Wompi sandbox public key to run this example.",
    });
  }

  const id = url.searchParams.get("id");
  if (!id) {
    return json({ ok: false, error: "Pass the transaction id as `?id=`." }, 400);
  }

  const wompi = new WompiClient({ publicKey, sandbox: true });

  const [error, response] = await wompi.transactions.getTransaction(id);
  if (error) {
    const notFound = "type" in error && error.type === "NOT_FOUND_ERROR";
    return json({ ok: false, error: error.message }, notFound ? 404 : 502);
  }

  const t = response;
  return json({
    ok: true,
    configured: true,
    transaction: {
      id: t.id,
      status: t.status,
      reference: t.reference,
      amountInCents: t.amount_in_cents ?? null,
      paymentMethodType: t.payment_method_type ?? null,
      statusMessage: t.status_message ?? null,
    },
  });
};
