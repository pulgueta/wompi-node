import { Link, useRouterState } from "@tanstack/react-router";
import { ShoppingCart, StarIcon } from "lucide-react";

import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import { useCart } from "#/lib/cart";
import { cn } from "#/lib/utils";

const viewTabClass =
  "px-[18px] py-[9px] text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-primary";

export function Navbar() {
  const { itemCount, setOpen } = useCart();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = pathname.startsWith("/admin");

  return (
    <nav className="sticky top-0 z-40 border-b-2 bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <span className="font-heading text-lg font-extrabold">
          PANA<span className="text-primary">BARBERO</span>
        </span>
        <Badge
          variant="outline"
          className="border-primary tracking-[0.02em] text-primary"
        >
          SANDBOX
        </Badge>
        <div className="ml-auto inline-flex border">
          <Link
            to="/"
            className={cn(
              viewTabClass,
              !isAdmin
                ? "bg-primary font-semibold text-primary-foreground"
                : "hover:bg-neutral-100",
            )}
          >
            Cliente
          </Link>
          <Link
            to="/admin"
            className={cn(
              viewTabClass,
              "border-l",
              isAdmin
                ? "bg-primary font-semibold text-primary-foreground"
                : "hover:bg-neutral-100",
            )}
          >
            Administrador
          </Link>
        </div>
        {!isAdmin && (
          <Button
            variant="outline"
            className="min-h-[38px]"
            onClick={() => setOpen(true)}
          >
            <ShoppingCart aria-hidden className="size-4" />
            Carrito ({itemCount})
          </Button>
        )}

        <a
          href="https://github.com/pulgueta/wompi-node"
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <StarIcon className="fill-amber-400 text-amber-400" /> GitHub
        </a>
      </div>
    </nav>
  );
}
