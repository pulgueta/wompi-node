import { useState } from "react";
import type { ComponentProps, SubmitEvent } from "react";

export const client = "visible";

type Result =
  | {
      ok: true;
      transaction: { id: string; status: string; reference: string };
      card: { brand: string | null; lastFour: string | null };
    }
  | { ok: false; error: string; step?: string; configured?: boolean };

const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-action";

export default function CardCheckoutForm() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setResult(null);

    try {
      const response = await fetch("/api/examples/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          card: {
            number: String(form.get("number") ?? "").replace(/\s+/g, ""),
            cvc: form.get("cvc"),
            exp_month: form.get("expMonth"),
            exp_year: form.get("expYear"),
            card_holder: form.get("cardHolder"),
          },
          customerEmail: form.get("customerEmail"),
          amountInCents: Number(form.get("amountInCents")),
        }),
      });
      setResult((await response.json()) as Result);
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Network error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="my-6 grid gap-5 lg:grid-cols-2">
      <form onSubmit={submit} className="grid gap-4 rounded-lg border border-border p-5">
        <Field id="number" label="Card number" defaultValue="4242424242424242" inputMode="numeric" />
        <div className="grid grid-cols-3 gap-3">
          <Field id="expMonth" label="MM" defaultValue="12" inputMode="numeric" maxLength={2} />
          <Field id="expYear" label="YY" defaultValue="29" inputMode="numeric" maxLength={2} />
          <Field id="cvc" label="CVC" defaultValue="123" inputMode="numeric" maxLength={4} />
        </div>
        <Field id="cardHolder" label="Cardholder" defaultValue="PEDRO PEREZ" />
        <Field id="customerEmail" label="Customer email" defaultValue="buyer@example.com" type="email" />
        <Field id="amountInCents" label="Amount in cents" defaultValue="2490000" inputMode="numeric" />
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md bg-action px-4 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Charging…" : "Charge sandbox card"}
        </button>
        <p className="m-0 text-xs text-muted-foreground">
          The request uses sandbox credentials stored only on the docs server.
        </p>
      </form>
      <ResultPanel pending={pending} result={result} />
    </div>
  );
}

function Field({ id, label, ...props }: { id: string; label: string } & ComponentProps<"input">) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground" htmlFor={id}>
      {label}
      <input className={inputClass} id={id} name={id} required {...props} />
    </label>
  );
}

function ResultPanel({ pending, result }: { pending: boolean; result: Result | null }) {
  const message = pending
    ? "Calling the sandbox…"
    : result
      ? JSON.stringify(result, null, 2)
      : "Submit the form to see the SDK response.";

  return (
    <pre className="m-0 min-h-64 overflow-x-auto rounded-lg border border-dashed border-border bg-muted p-5 text-xs leading-relaxed">
      <code>{message}</code>
    </pre>
  );
}
