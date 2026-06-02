import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WompiCredentials } from "@/lib/wompi-credentials";
import { useWompiCredentials } from "@/components/examples/use-wompi-credentials";

const EMPTY: WompiCredentials = { publicKey: "", privateKey: "", integrityKey: "" };

/**
 * Lets a visitor paste their own Wompi sandbox keys for the live examples.
 *
 * Nothing is sent anywhere on save — the keys land in this tab's
 * `sessionStorage` (see `useWompiCredentials`) and the example forms read them
 * back from there, attaching them as request headers only when you submit.
 */
export function CredentialsPanel() {
  const { credentials, hasCredentials, save, clear } = useWompiCredentials();
  const [draft, setDraft] = useState<WompiCredentials>(EMPTY);
  const [reveal, setReveal] = useState(false);

  // Hydrate the inputs from storage once the hook reads the current tab.
  useEffect(() => {
    if (credentials) setDraft(credentials);
  }, [credentials]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save({
      publicKey: draft.publicKey.trim(),
      privateKey: draft.privateKey.trim(),
      integrityKey: draft.integrityKey.trim(),
    });
  }

  function onClear() {
    clear();
    setDraft(EMPTY);
  }

  const filled = Boolean(
    draft.publicKey.trim() && draft.privateKey.trim() && draft.integrityKey.trim()
  );

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 rounded-xl border border-border bg-background p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Your sandbox keys</h3>
          <p className="text-xs text-muted-foreground">
            Bring your own Wompi <strong>test</strong> keys to run the examples below.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            hasCredentials ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {hasCredentials ? "Saved for this tab" : "Not set"}
        </span>
      </div>

      <div className="grid gap-3">
        <Field
          id="publicKey"
          label="Public key"
          placeholder="pub_test_…"
          reveal={reveal}
          value={draft.publicKey}
          onChange={(publicKey) => setDraft((d) => ({ ...d, publicKey }))}
        />
        <Field
          id="privateKey"
          label="Private key"
          placeholder="prv_test_…"
          reveal={reveal}
          value={draft.privateKey}
          onChange={(privateKey) => setDraft((d) => ({ ...d, privateKey }))}
        />
        <Field
          id="integrityKey"
          label="Integrity secret"
          placeholder="test_integrity_…"
          reveal={reveal}
          value={draft.integrityKey}
          onChange={(integrityKey) => setDraft((d) => ({ ...d, integrityKey }))}
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={reveal}
          onChange={(event) => setReveal(event.currentTarget.checked)}
          className="size-3.5 accent-primary"
        />
        Reveal values
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!filled}>
          {hasCredentials ? "Update keys" : "Save keys"}
        </Button>
        <Button type="button" variant="outline" onClick={onClear} disabled={!hasCredentials}>
          Clear
        </Button>
      </div>

      <Alert>
        <AlertTitle>Stored only in this browser tab</AlertTitle>
        <AlertDescription>
          Keys are saved to <code>sessionStorage</code>, so they are cleared when you close the tab
          and never reach our servers on save. When you submit an example they ride along as request
          headers, used for that one call and never persisted or logged. This browser-side handling
          is a <strong>demo convenience</strong> — real apps keep keys in server environment
          variables. Use <strong>sandbox/test keys only</strong>, never production secrets.
        </AlertDescription>
      </Alert>
    </form>
  );
}

function Field({
  id,
  label,
  placeholder,
  reveal,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  reveal: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        type={reveal ? "text" : "password"}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="font-mono text-xs"
      />
    </div>
  );
}
