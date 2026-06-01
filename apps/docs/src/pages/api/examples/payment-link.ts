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

/** Creates a hosted Wompi payment link and returns its public checkout URL. */
export const POST: APIRoute = async ({ request }) => {
  const rateLimited = await checkRateLimit(request, "payment-link");
  if (rateLimited) return rateLimited;

  // The visitor supplies their own sandbox keys; they travel as request headers
  // and are used only for this call — never read from env, persisted or logged.
  const { publicKey, privateKey } = readCredentialHeaders(request);
  if (!publicKey || !privateKey) {
    return json({
      configured: false,
      message: "Add your own Wompi sandbox public and private keys to run this example.",
    });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Request body must be valid JSON." }, 400);
  }

  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const amountInCents = Number(body.amountInCents);
  const singleUse = Boolean(body.singleUse);
  const collectShipping = Boolean(body.collectShipping);

  if (!name || !description || !Number.isInteger(amountInCents) || amountInCents < 1) {
    return json(
      {
        ok: false,
        error: "A name, a description and a whole `amountInCents` are required.",
      },
      400
    );
  }

  const wompi = new WompiClient({
    publicKey,
    privateKey,
    sandbox: true,
  });

  const [error, response] = await wompi.paymentLinks.createPaymentLink({
    name,
    description,
    single_use: singleUse,
    collect_shipping: collectShipping,
    amount_in_cents: amountInCents,
    currency: "COP",
  });
  if (error) {
    return json({ ok: false, error: error.message }, 422);
  }

  const link = response;

  return json({
    ok: true,
    configured: true,
    paymentLink: {
      id: link.id,
      url: link.checkout_url,
      name: link.name ?? name,
      amountInCents: link.amount_in_cents ?? amountInCents,
      singleUse: link.single_use ?? singleUse,
    },
  });
};
