import { useEffect, useState } from "react";

import { createFileRoute } from "@tanstack/react-router";

import { PayoutDialog, type PayoutTarget } from "#/components/payout-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { formatCOP } from "#/lib/catalog";
import { usePoll } from "#/lib/use-poll";
import {
  getAccountBalances,
  getDispersions,
  getProviders,
} from "#/server/payouts";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const ADMIN_POLL_MS = 4000;

function AdminPage() {
  const providers = usePoll(() => getProviders(), ADMIN_POLL_MS) ?? [];
  const dispersions = usePoll(
    () => getDispersions({ data: { limit: 20 } }),
    ADMIN_POLL_MS,
  );
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [target, setTarget] = useState<PayoutTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAccountBalances()
      .then(({ data }) => {
        if (cancelled || data === null) return;
        const total = data.reduce(
          (acc, account) => acc + account.balanceInCents,
          0,
        );
        setBalanceCents(total);
      })
      .catch(() => {
        // Payouts credentials may be absent locally; the tile shows a dash.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingCents = providers.reduce(
    (acc, provider) => acc + provider.pendingCents,
    0,
  );

  return (
    <main className="flex-1">
      <header className="border-b-2">
        <div className="mx-auto w-full max-w-6xl px-4 pb-6 pt-9">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-primary">
            VISTA ADMINISTRADOR · PAYOUTS BRE-B
          </p>
          <h1 className="mb-2.5 text-[34px] leading-[1.05] tracking-[-0.01em]">
            Pagos a proveedores
          </h1>
          <p className="mb-0 max-w-[680px] text-sm leading-relaxed text-neutral-800 [text-wrap:pretty]">
            Dispersa el saldo pendiente de cada proveedor a su llave Bre-B. El
            flujo consulta la llave en el directorio (el titular llega
            enmascarado), luego crea el payout y el estado final llega por
            webhook. Para simular fallos usa las llaves de error del sandbox:{" "}
            <code className="font-mono text-xs">
              noexiste@test.com, 12345, inactiva@test.com, timeout@test.com,
              error@test.com
            </code>
            .
          </p>
        </div>
      </header>

      <div className="border-b-2 bg-border">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-[2px] sm:grid-cols-3">
          <StatTile
            label="SALDO WOMPI CUENTA"
            value={balanceCents === null ? "—" : formatCOP(balanceCents)}
          />
          <StatTile
            label="PENDIENTE POR DISPERSAR"
            value={formatCOP(pendingCents)}
            accent
          />
          <StatTile
            label="PROVEEDORES CON LLAVE BRE-B"
            value={String(providers.length)}
          />
        </div>
      </div>

      <section className="mx-auto w-full max-w-6xl px-4 py-6">
        <h2 className="mb-3.5 text-lg">Proveedores</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proveedor</TableHead>
              <TableHead>Suministra</TableHead>
              <TableHead>Llave Bre-B</TableHead>
              <TableHead>Banco</TableHead>
              <TableHead className="text-right">Saldo pendiente</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => (
              <TableRow key={provider.key}>
                <TableCell className="font-semibold">{provider.name}</TableCell>
                <TableCell className="text-neutral-800">
                  {provider.supplies}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="mr-2 bg-neutral-100">
                    {provider.brebKeyType}
                  </Badge>
                  <code className="font-mono text-[12.5px]">
                    {provider.brebKey}
                  </code>
                </TableCell>
                <TableCell className="text-[12.5px]">{provider.bank}</TableCell>
                <TableCell className="text-right font-extrabold">
                  {formatCOP(provider.pendingCents)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    className="min-h-[34px] px-3.5 py-[5px] text-[12.5px]"
                    disabled={provider.pendingCents <= 0}
                    onClick={() =>
                      setTarget({
                        providerKey: provider.key,
                        providerName: provider.name,
                        brebKey: provider.brebKey,
                        brebKeyType: provider.brebKeyType,
                        amountCents: provider.pendingCents,
                      })
                    }
                  >
                    Pagar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {dispersions && dispersions.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-8">
          <h2 className="mb-3.5 text-lg">Historial de dispersiones</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead>Llave</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dispersions.map((dispersion) => (
                <TableRow key={dispersion.reference}>
                  <TableCell className="font-mono text-xs">
                    {new Date(dispersion.createdAt).toLocaleTimeString(
                      "es-CO",
                      { hour12: false },
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {dispersion.reference}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {dispersion.brebKey ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCOP(dispersion.amountInCents)}
                  </TableCell>
                  <TableCell>
                    <DispersionStatusBadge status={dispersion.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {target && (
        <PayoutDialog target={target} onClose={() => setTarget(null)} />
      )}
    </main>
  );
}

function StatTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-background px-10 py-[18px] sm:px-6 sm:first:pl-10">
      <p className="mb-0 text-[11px] tracking-[0.1em] text-neutral-800">
        {label}
      </p>
      <p
        className={`mb-0 text-[26px] font-extrabold ${accent ? "text-brand-700" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function DispersionStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const isFailed =
    normalized.includes("FAIL") ||
    normalized.includes("ERROR") ||
    normalized.includes("REJECT");
  const isFinal =
    isFailed ||
    normalized.includes("APPROVED") ||
    normalized.includes("PAYMENT");
  return (
    <Badge
      variant="secondary"
      className={
        isFailed
          ? "bg-brand-800 text-brand-100"
          : isFinal
            ? "bg-brand-100 text-brand-800"
            : "animate-blink bg-neutral-200 text-neutral-800"
      }
    >
      {normalized}
    </Badge>
  );
}
