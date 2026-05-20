import type { APIRoute } from "astro";
import { WompiClient } from "@pulgueta/wompi";
import { WOMPI_PUBLIC_KEY, WOMPI_PRIVATE_KEY } from "astro:env/server";

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Creates a hosted Wompi payment link and returns its public checkout URL. */
export const POST: APIRoute = async ({ request }) => {
  if (!WOMPI_PUBLIC_KEY || !WOMPI_PRIVATE_KEY) {
    return json({
      configured: false,
      message: "Add WOMPI_PUBLIC_KEY and WOMPI_PRIVATE_KEY to apps/docs/.env to run this example.",
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
      { ok: false, error: "A name, a description and a whole `amountInCents` are required." },
      400
    );
  }

  const wompi = new WompiClient({
    publicKey: WOMPI_PUBLIC_KEY,
    privateKey: WOMPI_PRIVATE_KEY,
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

  const link = response.data;
  return json({
    ok: true,
    configured: true,
    paymentLink: {
      id: link.id,
      url: `https://checkout.wompi.co/l/${link.id}`,
      name: link.name ?? name,
      amountInCents: link.amount_in_cents ?? amountInCents,
      singleUse: link.single_use ?? singleUse,
    },
  });
};
