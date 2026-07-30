import { useEffect, useState } from "react";

import { createFileRoute } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";

import { CheckoutResultDialog } from "#/components/checkout-result-dialog";
import { Button } from "#/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { productImages } from "#/assets/products";
import {
  CATEGORIES,
  PRODUCTS,
  PROVIDER_NAMES,
  formatCOP,
  type Category,
  type Product,
} from "#/lib/catalog";
import { useCart } from "#/lib/cart";
import {
  type PurchaseRecord,
  readPurchaseHistory,
} from "#/lib/purchase-history";
import { cn } from "#/lib/utils";

interface CheckoutReturnSearch {
  id?: string;
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): CheckoutReturnSearch => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: ClientePage,
});

function ClientePage() {
  const { id: transactionId } = Route.useSearch();
  const [filter, setFilter] = useState<Category>("Todos");
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseRecord[]>([]);

  useEffect(() => {
    setPurchaseHistory(readPurchaseHistory(window.localStorage));
  }, [transactionId]);

  const products =
    filter === "Todos" ? PRODUCTS : PRODUCTS.filter((p) => p.cat === filter);

  return (
    <main className="flex-1">
      <header className="border-b-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-end gap-6 px-4 pb-6 pt-9">
          <div className="max-w-[640px]">
            <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-primary">
              VISTA CLIENTE · CHECKOUT WOMPI
            </p>
            <h1 className="mb-2.5 text-[34px] leading-[1.05] tracking-[-0.01em]">
              Tienda de insumos de barbería
            </h1>
            <p className="mb-0 text-sm leading-relaxed text-neutral-800 [text-wrap:pretty]">
              Agrega productos al carrito y completa tus datos de comprador. Al
              pagar, se abre el checkout de Wompi (sandbox) con tus datos
              precargados; el pedido se confirma cuando el webhook{" "}
              <code className="font-mono text-[12.5px]">
                transaction.updated
              </code>{" "}
              reporta el estado final.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setFilter(category)}
                className={cn(
                  "border px-[13px] py-1.5 text-xs transition-colors hover:border-foreground",
                  filter === category
                    ? "border-primary bg-primary font-semibold text-primary-foreground"
                    : "bg-transparent",
                )}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="border-b-2">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-[2px] border-x bg-border">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>

      {purchaseHistory.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-6">
          <h2 className="mb-3.5 text-lg">Mis compras</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseHistory.map((purchase) => (
                <TableRow key={purchase.transactionId}>
                  <TableCell>
                    {new Date(purchase.finalizedAt).toLocaleString("es-CO")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {purchase.reference}
                  </TableCell>
                  <TableCell>
                    {purchase.items
                      .map((item) => `${item.quantity}x ${item.name}`)
                      .join(", ")}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCOP(purchase.amountInCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {transactionId && <CheckoutResultDialog transactionId={transactionId} />}
    </main>
  );
}

function ProductCard({ product }: { product: Product }) {
  const { quantities, add, remove } = useCart();
  const quantity = quantities[product.id] ?? 0;

  return (
    <article className="flex flex-col gap-2 bg-background p-[18px]">
      <div className="flex aspect-square items-center justify-center border bg-neutral-100 grayscale">
        <img
          src={productImages[product.id]}
          alt={product.name}
          width={240}
          height={240}
          loading="lazy"
          className="size-full object-contain p-4"
        />
      </div>
      <p className="mb-0 text-[10px] uppercase tracking-[0.1em] text-primary">
        {product.cat}
      </p>
      <h2 className="mb-0 text-[15px] font-extrabold leading-tight">
        {product.name}
      </h2>
      <p className="mb-0 text-[11.5px] text-neutral-800">
        {product.pres} · {PROVIDER_NAMES[product.providerKey]}
      </p>
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-[17px] font-extrabold">
          {formatCOP(product.priceCents)}
        </span>
        {quantity > 0 ? (
          <div className="inline-flex items-center border border-foreground">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Quitar una unidad de ${product.name}`}
              className="size-auto px-[11px] py-1.5 hover:bg-neutral-100"
              onClick={() => remove(product.id)}
            >
              <Minus aria-hidden className="size-3.5" />
            </Button>
            <span className="border-x px-[11px] py-1.5 font-extrabold">
              {quantity}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Agregar una unidad de ${product.name}`}
              className="size-auto px-[11px] py-1.5 hover:bg-neutral-100"
              onClick={() => add(product.id)}
            >
              <Plus aria-hidden className="size-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="min-h-[34px] px-3 py-[5px] text-[12.5px]"
            onClick={() => add(product.id)}
          >
            Agregar
          </Button>
        )}
      </div>
    </article>
  );
}
