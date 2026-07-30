import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { PRODUCTS, SHIPPING_CENTS } from "#/lib/catalog";

export type DocumentType = "CC" | "CE" | "NIT";

export interface Buyer {
  fullName: string;
  documentType: DocumentType;
  document: string;
  email: string;
  phone: string;
  address: string;
  city: string;
}

const DEFAULT_BUYER: Buyer = {
  fullName: "Camila Restrepo",
  documentType: "CC",
  document: "1020304050",
  email: "camila@correo.co",
  phone: "3001234567",
  address: "Cra 13 # 45-67, ap 302",
  city: "Bogotá",
};

interface CartState {
  quantities: Record<string, number>;
  buyer: Buyer;
  isOpen: boolean;
}

interface CartContextValue extends CartState {
  add: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
  setBuyer: (patch: Partial<Buyer>) => void;
  setOpen: (open: boolean) => void;
  itemCount: number;
  subtotalCents: number;
  totalCents: number;
  lines: Array<{ productId: string; quantity: number }>;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "panabarbero:cart";

function readStoredState(): Pick<CartState, "quantities" | "buyer"> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { quantities: {}, buyer: DEFAULT_BUYER };
    const parsed = JSON.parse(raw) as Partial<CartState>;
    return {
      quantities: parsed.quantities ?? {},
      buyer: { ...DEFAULT_BUYER, ...parsed.buyer },
    };
  } catch {
    return { quantities: {}, buyer: DEFAULT_BUYER };
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>({
    quantities: {},
    buyer: DEFAULT_BUYER,
    isOpen: false,
  });
  // Stored cart loads after mount so the server and first client render
  // agree; saving starts only once that load happened.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState((s) => ({ ...s, ...readStoredState() }));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ quantities: state.quantities, buyer: state.buyer }),
    );
  }, [hydrated, state.quantities, state.buyer]);

  const add = useCallback((productId: string) => {
    setState((s) => ({
      ...s,
      quantities: {
        ...s.quantities,
        [productId]: (s.quantities[productId] ?? 0) + 1,
      },
    }));
  }, []);

  const remove = useCallback((productId: string) => {
    setState((s) => {
      const next = { ...s.quantities };
      const quantity = (next[productId] ?? 0) - 1;
      if (quantity <= 0) delete next[productId];
      else next[productId] = quantity;
      return { ...s, quantities: next };
    });
  }, []);

  const clear = useCallback(() => {
    setState((s) => ({ ...s, quantities: {} }));
  }, []);

  const setBuyer = useCallback((patch: Partial<Buyer>) => {
    setState((s) => ({ ...s, buyer: { ...s.buyer, ...patch } }));
  }, []);

  const setOpen = useCallback((isOpen: boolean) => {
    setState((s) => ({ ...s, isOpen }));
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const lines = Object.entries(state.quantities).map(
      ([productId, quantity]) => ({ productId, quantity }),
    );
    const subtotalCents = lines.reduce((acc, line) => {
      const product = PRODUCTS.find((p) => p.id === line.productId);
      return acc + (product ? product.priceCents * line.quantity : 0);
    }, 0);
    return {
      ...state,
      add,
      remove,
      clear,
      setBuyer,
      setOpen,
      lines,
      itemCount: lines.reduce((acc, line) => acc + line.quantity, 0),
      subtotalCents,
      totalCents: subtotalCents > 0 ? subtotalCents + SHIPPING_CENTS : 0,
    };
  }, [state, add, remove, clear, setBuyer, setOpen]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("useCart must be used within CartProvider");
  return cart;
}
