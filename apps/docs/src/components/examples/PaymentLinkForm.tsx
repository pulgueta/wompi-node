import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Response =
  | {
      ok: true;
      configured: true;
      paymentLink: {
        id: string;
        url: string;
        name: string;
        amountInCents: number;
        singleUse: boolean;
      };
    }
  | { ok: false; configured?: boolean; error: string }
  | { configured: false; message: string };

const defaults = {
  name: "Order #1024",
  description: "Thank you for shopping with us.",
  amountInCents: "200000",
};

export function PaymentLinkForm() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Response | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setPending(true);
    setResult(null);

    try {
      const res = await fetch("/api/examples/payment-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          amountInCents: Number(form.get("amountInCents")),
          singleUse: form.get("singleUse") === "on",
          collectShipping: form.get("collectShipping") === "on",
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
        <div className="grid gap-1.5">
          <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">
            Link name
          </Label>
          <Input id="name" name="name" defaultValue={defaults.name} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="description" className="text-xs font-medium text-muted-foreground">
            Description
          </Label>
          <Input id="description" name="description" defaultValue={defaults.description} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="amountInCents" className="text-xs font-medium text-muted-foreground">
            Amount (in cents)
          </Label>
          <Input
            id="amountInCents"
            name="amountInCents"
            defaultValue={defaults.amountInCents}
            required
            inputMode="numeric"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="singleUse"
              defaultChecked
              className="size-4 accent-primary"
            />
            Single use
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="collectShipping" className="size-4 accent-primary" />
            Collect shipping address
          </label>
        </div>

        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? "Creating…" : "Create payment link"}
        </Button>

        <p className="text-xs text-muted-foreground">
          Submits to <code>POST /api/examples/payment-link</code>. Uses your sandbox keys.
        </p>
      </form>

      <ResultPanel result={result} pending={pending} />
    </div>
  );
}

function ResultPanel({ result, pending }: { result: Response | null; pending: boolean }) {
  if (pending) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        Calling <code className="mx-1">/api/examples/payment-link</code>…
      </div>
    );
  }

  if (!result) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        Submit the form to receive a hosted checkout URL.
      </div>
    );
  }

  if ("paymentLink" in result && result.ok) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-background p-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Checkout URL</p>
          <a
            href={result.paymentLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-primary hover:underline"
          >
            {result.paymentLink.url}
          </a>
        </div>
        <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed">
          <code>{JSON.stringify(result, null, 2)}</code>
        </pre>
      </div>
    );
  }

  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
      <code>{JSON.stringify(result, null, 2)}</code>
    </pre>
  );
}
