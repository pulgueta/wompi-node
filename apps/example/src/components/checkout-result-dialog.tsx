import { useEffect, useState } from "react";

import { useNavigate } from "@tanstack/react-router";
import { Check, X } from "lucide-react";

import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { formatCOP, PRODUCTS } from "#/lib/catalog";
import { useCart } from "#/lib/cart";
import {
  clearCheckoutBinding,
  readCheckoutBinding,
  type CheckoutBinding,
} from "#/lib/checkout-storage";
import { recordPurchase } from "#/lib/purchase-history";
import { usePoll } from "#/lib/use-poll";
import { getCheckoutTransaction } from "#/server/checkout";

/**
 * Shown when Wompi's hosted checkout redirects back with ?id=<transactionId>.
 * The final state arrives through the transaction.updated webhook recorded by
 * /api/checkout-webhook; while it lands, the dialog polls the backend, which
 * reconciles against the Wompi API.
 */
export function CheckoutResultDialog({
  transactionId,
}: {
  transactionId: string;
}) {
  const navigate = useNavigate();
  const { clear, lines } = useCart();
  // Read after mount so the server and first client render agree.
  const [binding, setBinding] = useState<CheckoutBinding | null>(null);
  const [bindingReady, setBindingReady] = useState(false);
  const [isFinal, setIsFinal] = useState(false);

  useEffect(() => {
    setBinding(readCheckoutBinding(window.localStorage));
    setBindingReady(true);
  }, []);

  const result = usePoll(
    async () => {
      if (!binding) return null;
      const response = await getCheckoutTransaction({
        data: {
          transactionId,
          reference: binding.reference,
          orderProof: binding.orderProof,
          amountInCents: binding.amountInCents,
        },
      });
      if (response.error || response.data.status !== "PENDING") {
        setIsFinal(true);
      }
      return response;
    },
    3000,
    bindingReady && binding !== null && !isFinal,
  );

  const close = () => {
    void navigate({ to: "/", search: {}, replace: true });
  };

  const finish = () => {
    clear();
    clearCheckoutBinding(window.localStorage);
    close();
  };

  const transaction = result?.data ?? null;
  const status = (transaction?.status ?? "PENDING").toUpperCase();
  const isApproved = status === "APPROVED";
  const hasError = (bindingReady && binding === null) || result?.error != null;

  useEffect(() => {
    if (!isFinal || !isApproved || !binding || !transaction) return;

    const items =
      binding.items.length > 0
        ? binding.items
        : lines.flatMap(({ productId, quantity }) => {
            const product = PRODUCTS.find(({ id }) => id === productId);
            return product
              ? [
                  {
                    productId,
                    name: product.name,
                    quantity,
                    unitPriceCents: product.priceCents,
                  },
                ]
              : [];
          });
    recordPurchase(window.localStorage, {
      reference: binding.reference,
      transactionId: transaction.id,
      amountInCents: binding.amountInCents,
      finalizedAt: new Date().toISOString(),
      items,
    });
  }, [binding, isApproved, isFinal, lines, transaction]);

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent
        className="w-[440px] max-w-full gap-0 border-0 bg-background p-0 shadow-lg"
        showCloseButton={false}
      >
        <div className="flex items-center gap-2.5 bg-foreground px-5 py-3.5 text-background">
          <span className="text-base font-extrabold tracking-[-0.02em]">
            wompi
          </span>
          <span className="text-[11px] opacity-70">Checkout · Sandbox</span>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={close}
            className="ml-auto cursor-pointer p-1"
          >
            <X aria-hidden className="size-[15px]" />
          </button>
        </div>
        <p className="mb-0 bg-primary px-5 py-1.5 text-[10.5px] font-semibold tracking-[0.1em] text-primary-foreground">
          ESTÁS EN MODO SANDBOX — PAGOS DE PRUEBA
        </p>

        {hasError && (
          <div className="flex flex-col gap-3 px-5 py-6">
            <DialogHeader className="gap-0">
              <DialogTitle className="flex items-center gap-2.5 text-lg font-extrabold">
                <X aria-hidden className="size-5 text-primary" />
                No se pudo verificar el pago
              </DialogTitle>
            </DialogHeader>
            <DialogDescription className="text-[13px] leading-relaxed text-neutral-800">
              {binding === null
                ? "Este navegador ya no tiene la referencia del pedido lanzado. Inicia otro checkout desde el carrito."
                : result?.error?.message}
            </DialogDescription>
            <Button
              variant="outline"
              className="min-h-11 w-full"
              onClick={close}
            >
              Volver a la tienda
            </Button>
          </div>
        )}

        {!hasError && !isFinal && (
          <div className="flex flex-col gap-3 px-5 py-7">
            <DialogHeader className="gap-0">
              <DialogTitle className="flex items-center gap-2.5 text-lg font-extrabold">
                <span aria-hidden className="size-3 animate-blink bg-primary" />
                Transacción PENDING
              </DialogTitle>
            </DialogHeader>
            <DialogDescription className="text-[13px] leading-relaxed text-neutral-800">
              Wompi creó la transacción{" "}
              <code className="font-mono text-xs">{transactionId}</code>.
              Esperando el evento{" "}
              <code className="font-mono text-xs">transaction.updated</code> en
              el webhook{" "}
              <code className="font-mono text-xs">/api/checkout-webhook</code>…
            </DialogDescription>
          </div>
        )}

        {!hasError && isFinal && (
          <div className="flex flex-col gap-3 px-5 py-6">
            <DialogHeader className="gap-0">
              <DialogTitle className="flex items-center gap-2.5 text-xl font-extrabold">
                {isApproved ? (
                  <Check aria-hidden className="size-6 text-primary" />
                ) : (
                  <X aria-hidden className="size-6 text-primary" />
                )}
                Pago {isApproved ? "APROBADO" : "RECHAZADO"}
              </DialogTitle>
            </DialogHeader>
            <DialogDescription className="text-[13px] leading-relaxed text-neutral-800">
              {isApproved ? (
                <>
                  Wompi confirmó la transacción. Tu pedido{" "}
                  <code className="font-mono text-xs">
                    {binding?.reference}
                  </code>{" "}
                  quedó pagado
                  {transaction?.amountInCents != null ? (
                    <> por {formatCOP(transaction.amountInCents)}</>
                  ) : null}
                  .
                </>
              ) : (
                <>
                  La transacción terminó en estado {status} (simulación
                  sandbox). El carrito se conserva para reintentar.
                </>
              )}
            </DialogDescription>
            {isApproved ? (
              <Button className="min-h-11 w-full" onClick={finish}>
                Volver a la tienda
              </Button>
            ) : (
              <Button
                variant="outline"
                className="min-h-11 w-full"
                onClick={close}
              >
                Reintentar pago
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
