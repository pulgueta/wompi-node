import { useState } from "react";

import { ArrowRight, Minus, Plus, X } from "lucide-react";

import { Button } from "#/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { PRODUCTS, SHIPPING_CENTS, formatCOP } from "#/lib/catalog";
import { useCart, type DocumentType } from "#/lib/cart";
import { saveCheckoutBinding } from "#/lib/checkout-storage";
import { cn } from "#/lib/utils";
import { createCheckoutSession } from "#/server/checkout";

const DOCUMENT_TYPES: DocumentType[] = ["CC", "CE", "NIT"];

export function CartDrawer() {
  const cart = useCart();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async () => {
    if (cart.totalCents <= 0 || isRedirecting) return;
    const items = cart.lines.flatMap(({ productId, quantity }) => {
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
    setIsRedirecting(true);
    setError(null);
    try {
      // The server recomputes the amount from the catalog, signs the
      // integrity hash, and returns the hosted Web Checkout URL.
      const { error: checkoutError, data } = await createCheckoutSession({
        data: {
          lines: cart.lines,
          buyer: {
            fullName: cart.buyer.fullName,
            email: cart.buyer.email,
            phone: cart.buyer.phone,
            document: cart.buyer.document,
            documentType: cart.buyer.documentType,
          },
        },
      });
      if (checkoutError) {
        setError(checkoutError.message);
        setIsRedirecting(false);
        return;
      }
      saveCheckoutBinding(window.localStorage, {
        reference: data.reference,
        orderProof: data.orderProof,
        amountInCents: data.amountInCents,
        items,
      });
      window.location.href = data.checkoutUrl;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo iniciar el pago.",
      );
      setIsRedirecting(false);
    }
  };

  return (
    <Drawer
      open={cart.isOpen}
      onOpenChange={cart.setOpen}
      swipeDirection="right"
    >
      <DrawerContent className="w-dvw max-w-none bg-background sm:w-[400px] sm:max-w-[92vw]">
        <DrawerHeader className="flex-row items-center justify-between border-b-2 border-foreground py-0 pl-5 pr-0">
          <DrawerTitle className="py-4 text-[15px] font-extrabold">
            TU PEDIDO ({cart.itemCount})
          </DrawerTitle>
          <DrawerClose
            aria-label="Cerrar carrito"
            className="flex size-11 cursor-pointer items-center justify-center self-stretch border-l transition-colors hover:bg-neutral-100"
          >
            <X aria-hidden className="size-[18px]" />
          </DrawerClose>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
          {cart.lines.length === 0 && (
            <p className="px-5 py-7 text-[13px] text-neutral-800">
              Tu carrito está vacío. Agrega productos de la grilla.
            </p>
          )}

          {cart.lines.map((line) => {
            const product = PRODUCTS.find((p) => p.id === line.productId);
            if (!product) return null;
            return (
              <div
                key={line.productId}
                className="flex items-center gap-3 border-b px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="mb-0 text-[13px] font-semibold">
                    {product.name}
                  </p>
                  <p className="mb-0 text-[11px] text-neutral-800">
                    {formatCOP(product.priceCents)} c/u
                  </p>
                </div>
                <div className="inline-flex items-center border text-[13px]">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar una unidad de ${product.name}`}
                    className="size-auto px-2.5 py-1 hover:bg-neutral-100"
                    onClick={() => cart.remove(line.productId)}
                  >
                    <Minus aria-hidden className="size-3" />
                  </Button>
                  <span className="px-3 py-1 font-semibold">
                    {line.quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Agregar una unidad de ${product.name}`}
                    className="size-auto px-2.5 py-1 hover:bg-neutral-100"
                    onClick={() => cart.add(line.productId)}
                  >
                    <Plus aria-hidden className="size-3" />
                  </Button>
                </div>
                <span className="w-[74px] text-right text-[13px] font-extrabold">
                  {formatCOP(product.priceCents * line.quantity)}
                </span>
              </div>
            );
          })}

          {cart.lines.length > 0 && (
            <>
              <div className="flex flex-col gap-1 border-b-2 border-foreground px-5 py-3 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-neutral-800">Subtotal</span>
                  <span>{formatCOP(cart.subtotalCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-800">Envío (Bogotá)</span>
                  <span>{formatCOP(SHIPPING_CENTS)}</span>
                </div>
                <div className="mt-1 flex justify-between text-base font-extrabold">
                  <span>Total</span>
                  <span>{formatCOP(cart.totalCents)}</span>
                </div>
              </div>

              <form
                className="flex flex-col gap-2.5 px-5 py-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void startCheckout();
                }}
              >
                <p className="mb-0 text-[10px] font-semibold tracking-[0.12em] text-primary">
                  DATOS DEL COMPRADOR — SE PRECARGAN EN WOMPI
                </p>
                <BuyerField
                  label="Nombre completo"
                  value={cart.buyer.fullName}
                  onChange={(fullName) => cart.setBuyer({ fullName })}
                />
                <div className="grid grid-cols-[auto_1fr] items-end gap-2">
                  <div>
                    <Label className="mb-1.5 text-xs text-neutral-700">
                      Tipo
                    </Label>
                    <div className="inline-flex border">
                      {DOCUMENT_TYPES.map((type, index) => (
                        <button
                          key={type}
                          type="button"
                          className={cn(
                            "px-3 py-[7px] text-[13px]",
                            index > 0 && "border-l",
                            cart.buyer.documentType === type
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-neutral-100",
                          )}
                          onClick={() => cart.setBuyer({ documentType: type })}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  <BuyerField
                    label="Documento"
                    value={cart.buyer.document}
                    onChange={(document) => cart.setBuyer({ document })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <BuyerField
                    label="Email"
                    type="email"
                    value={cart.buyer.email}
                    onChange={(email) => cart.setBuyer({ email })}
                  />
                  <BuyerField
                    label="Celular"
                    value={cart.buyer.phone}
                    onChange={(phone) => cart.setBuyer({ phone })}
                  />
                </div>
                <div className="grid grid-cols-[2fr_1fr] gap-2">
                  <BuyerField
                    label="Dirección de entrega"
                    value={cart.buyer.address}
                    onChange={(address) => cart.setBuyer({ address })}
                  />
                  <BuyerField
                    label="Ciudad"
                    value={cart.buyer.city}
                    onChange={(city) => cart.setBuyer({ city })}
                  />
                </div>
                {error && (
                  <p className="mb-0 border border-primary bg-brand-100 px-3 py-2 text-xs text-brand-800">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="min-h-[46px] w-full justify-start text-sm"
                  disabled={isRedirecting}
                >
                  {isRedirecting
                    ? "Abriendo el checkout de Wompi…"
                    : `Pagar ${formatCOP(cart.totalCents)} con Wompi`}
                  <ArrowRight aria-hidden className="ml-auto size-4" />
                </Button>
                <p className="mb-0 font-mono text-[10px] leading-relaxed text-neutral-800">
                  → checkout.wompi.co (sandbox) · la referencia y la firma de
                  integridad se generan en el backend.
                  <br />
                  Tarjetas de prueba: 4242 4242 4242 4242 → APROBADA · 4111 1111
                  1111 1111 → RECHAZADA
                </p>
              </form>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function BuyerField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label className="mb-1.5 text-xs text-neutral-700">{label}</Label>
      <Input
        type={type}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
