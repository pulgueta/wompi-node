import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { credentialHeaders } from "@/lib/wompi-credentials";
import { useWompiCredentials } from "@/components/examples/use-wompi-credentials";

type TransactionStatus = "PENDING" | "APPROVED" | "DECLINED" | "ERROR" | "VOIDED";

type Response =
  | {
      ok: true;
      configured: true;
      transaction: {
        id: string;
        status: TransactionStatus;
        reference: string;
        amountInCents: number;
        paymentMethodType: string;
        statusMessage: string | null;
        createdAt: string | null;
      };
      card: { brand: string | null; lastFour: string | null };
    }
  | { ok: false; configured?: boolean; step?: string; error: string }
  | { configured: false; message: string };

const defaults = {
  number: "4242424242424242",
  cvc: "123",
  expMonth: "12",
  expYear: "29",
  cardHolder: "PEDRO PEREZ",
  customerEmail: "buyer@example.com",
  amountInCents: "2490000",
};

export function CardCheckoutForm() {
  const { credentials, hasCredentials } = useWompiCredentials();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Response | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    if (!credentials) {
      setResult({
        configured: false,
        message: "Add your Wompi sandbox keys above to run this example.",
      });
      return;
    }

    setPending(true);
    setResult(null);

    try {
      const res = await fetch("/api/examples/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", ...credentialHeaders(credentials) },
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
      setResult((await res.json()) as Response);
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Network error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
      <form
        onSubmit={onSubmit}
        className="grid gap-4 rounded-xl border border-border bg-background p-5"
      >
        <Field
          id="number"
          label="Card number"
          defaultValue={defaults.number}
          placeholder="4242 4242 4242 4242"
          inputMode="numeric"
        />
        <div className="grid grid-cols-3 gap-3">
          <Field
            id="expMonth"
            label="MM"
            defaultValue={defaults.expMonth}
            inputMode="numeric"
            maxLength={2}
          />
          <Field
            id="expYear"
            label="YY"
            defaultValue={defaults.expYear}
            inputMode="numeric"
            maxLength={2}
          />
          <Field
            id="cvc"
            label="CVC"
            defaultValue={defaults.cvc}
            inputMode="numeric"
            maxLength={4}
          />
        </div>
        <Field id="cardHolder" label="Cardholder" defaultValue={defaults.cardHolder} />
        <Field
          id="customerEmail"
          label="Customer email"
          defaultValue={defaults.customerEmail}
          type="email"
        />
        <Field
          id="amountInCents"
          label="Amount (in cents)"
          defaultValue={defaults.amountInCents}
          inputMode="numeric"
        />

        <Button type="submit" disabled={pending || !hasCredentials} className="mt-1 w-full">
          {pending ? "Charging…" : "Charge sandbox card"}
        </Button>

        <p className="text-xs text-muted-foreground">
          Submits to <code>POST /api/examples/checkout</code> with the sandbox keys you saved above.
          Sandbox cards only.
          {!hasCredentials && " Add your keys to enable this form."}
        </p>
      </form>

      <ResultPanel result={result} pending={pending} />
    </div>
  );
}

function Field({
  id,
  label,
  ...inputProps
}: { id: string; label: string } & React.ComponentProps<"input">) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Input id={id} name={id} required {...inputProps} />
    </div>
  );
}

function ResultPanel({ result, pending }: { result: Response | null; pending: boolean }) {
  if (pending) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        Sending request to <code className="mx-1">/api/examples/checkout</code>…
      </div>
    );
  }

  if (!result) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        Submit the form to see the SDK call in action.
      </div>
    );
  }

  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
      <code>{JSON.stringify(result, null, 2)}</code>
    </pre>
  );
}
