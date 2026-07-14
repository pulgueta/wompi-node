import { useState } from "react";
import type { SubmitEvent } from "react";

export const client = "visible";

type Result =
  | {
      ok: true;
      paymentLink: { id: string; url: string; name: string; amountInCents: number };
    }
  | { ok: false; error: string; configured?: boolean };

const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-action";

export default function PaymentLinkForm() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setResult(null);

    try {
      const response = await fetch("/api/examples/payment-link", {
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
      setResult((await response.json()) as Result);
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Network error" });
    } finally {
      setPending(false);
    }
  }

  const link = result?.ok ? result.paymentLink : null;

  return (
    <div className="my-6 grid gap-5 lg:grid-cols-2">
      <form onSubmit={submit} className="grid gap-4 rounded-lg border border-border p-5">
        <Field id="name" label="Link name" defaultValue="Order #1024" />
        <Field id="description" label="Description" defaultValue="Thank you for shopping with us." />
        <Field id="amountInCents" label="Amount in cents" defaultValue="200000" inputMode="numeric" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="singleUse" defaultChecked /> Single use
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="collectShipping" /> Collect shipping address
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md bg-action px-4 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create payment link"}
        </button>
        <p className="m-0 text-xs text-muted-foreground">
          The request uses sandbox credentials stored only on the docs server.
        </p>
      </form>
      <div className="min-h-64 rounded-lg border border-dashed border-border bg-muted p-5 text-sm">
        {link ? (
          <>
            <p className="mt-0 font-medium">Sandbox checkout URL</p>
            <a className="break-all text-action underline" href={link.url} target="_blank" rel="noreferrer">
              {link.url}
            </a>
            <pre className="overflow-x-auto text-xs"><code>{JSON.stringify(result, null, 2)}</code></pre>
          </>
        ) : (
          <pre className="m-0 whitespace-pre-wrap text-xs"><code>{pending ? "Calling the sandbox…" : result ? JSON.stringify(result, null, 2) : "Submit the form to receive a hosted checkout URL."}</code></pre>
        )}
      </div>
    </div>
  );
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<"input">) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground" htmlFor={id}>
      {label}
      <input className={inputClass} id={id} name={id} required {...props} />
    </label>
  );
}
