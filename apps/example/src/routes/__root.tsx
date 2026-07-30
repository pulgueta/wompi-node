import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";

import { CartDrawer } from "#/components/cart-drawer";
import { ChatWidget } from "#/components/chat-widget";
import { Navbar } from "#/components/navbar";
import { CartProvider } from "#/lib/cart";

import appCss from "../styles.css?url";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
const convexClient = new ConvexReactClient(convexUrl);

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "PanaBarbero · Wompi SDK sandbox" },
      {
        name: "description",
        content:
          "Tienda de insumos de barbería con checkout Wompi, payouts Bre-B y asistente de documentación — demo sandbox del SDK @pulgueta/wompi.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: AppLayout,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}

        <Scripts />
      </body>
    </html>
  );
}

function AppLayout() {
  return (
    <ConvexProvider client={convexClient}>
      <CartProvider>
        <div className="flex min-h-screen flex-col pb-11">
          <Navbar />
          <Outlet />
        </div>
        <CartDrawer />
        {convexClient && <ChatWidget />}
      </CartProvider>
    </ConvexProvider>
  );
}
