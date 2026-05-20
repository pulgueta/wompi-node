import type { APIRoute } from "astro";
import { WompiClient } from "@pulgueta/wompi";
import { WOMPI_PUBLIC_KEY } from "astro:env/server";

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Looks up a single transaction by id — used to poll a pending status. */
export const GET: APIRoute = async ({ url }) => {
  if (!WOMPI_PUBLIC_KEY) {
    return json({
      configured: false,
      message: "Add WOMPI_PUBLIC_KEY to apps/docs/.env to run this example.",
    });
  }

  const id = url.searchParams.get("id");
  if (!id) {
    return json({ ok: false, error: "Pass the transaction id as `?id=`." }, 400);
  }

  const wompi = new WompiClient({ publicKey: WOMPI_PUBLIC_KEY, sandbox: true });

  const [error, response] = await wompi.transactions.getTransaction(id);
  if (error) {
    const notFound = "type" in error && error.type === "NOT_FOUND_ERROR";
    return json({ ok: false, error: error.message }, notFound ? 404 : 502);
  }

  const t = response.data;
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
