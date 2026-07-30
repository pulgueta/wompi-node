export interface Product {
  id: string;
  name: string;
  pres: string;
  cat: Category;
  priceCents: number;
  providerKey: string;
}

export const CATEGORIES = [
  "Todos",
  "Fijación",
  "Barba",
  "Afeitado",
  "Higiene",
  "Insumos",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const PRODUCTS: Product[] = [
  {
    id: "pomada",
    name: "Pomada mate fijación fuerte",
    pres: "120 g",
    cat: "Fijación",
    priceCents: 38_000_00,
    providerKey: "p1",
  },
  {
    id: "cera",
    name: "Cera para bigote",
    pres: "15 g",
    cat: "Barba",
    priceCents: 24_000_00,
    providerKey: "p1",
  },
  {
    id: "alcohol",
    name: "Alcohol antiséptico 70%",
    pres: "1 L",
    cat: "Higiene",
    priceCents: 18_500_00,
    providerKey: "p2",
  },
  {
    id: "desinf",
    name: "Desinfectante de herramientas",
    pres: "1 L",
    cat: "Higiene",
    priceCents: 52_000_00,
    providerKey: "p2",
  },
  {
    id: "toallas",
    name: "Toallas calientes desechables",
    pres: "Caja ×50",
    cat: "Insumos",
    priceCents: 22_000_00,
    providerKey: "p3",
  },
  {
    id: "talco",
    name: "Talco neutro para nuca",
    pres: "250 g",
    cat: "Insumos",
    priceCents: 16_000_00,
    providerKey: "p3",
  },
  {
    id: "aceite",
    name: "Aceite para barba — cedro",
    pres: "30 ml",
    cat: "Barba",
    priceCents: 42_000_00,
    providerKey: "p4",
  },
  {
    id: "locion",
    name: "Loción aftershave clásica",
    pres: "200 ml",
    cat: "Afeitado",
    priceCents: 35_000_00,
    providerKey: "p5",
  },
  {
    id: "gel",
    name: "Gel de afeitado transparente",
    pres: "500 ml",
    cat: "Afeitado",
    priceCents: 28_500_00,
    providerKey: "p6",
  },
  {
    id: "champu",
    name: "Champú de barba",
    pres: "250 ml",
    cat: "Barba",
    priceCents: 31_000_00,
    providerKey: "p6",
  },
];

export const PROVIDER_NAMES: Record<string, string> = {
  p1: "Distribuciones Elías",
  p2: "Acme Soluciones S.A.S.",
  p3: "Tienda Wompi Insumos",
  p4: "María López Ruiz",
  p5: "Johan C. Pérez Gómez",
  p6: "Andrés F. García",
};

export const SHIPPING_CENTS = 8_000_00;

/** Sandbox BRE-B keys that simulate directory errors (docs.wompi.co · sandbox-breb). */
export const BREB_ERROR_KEYS = [
  "noexiste@test.com",
  "12345",
  "inactiva@test.com",
  "timeout@test.com",
  "error@test.com",
] as const;

const copFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

export function formatCOP(cents: number): string {
  return `$ ${copFormatter.format(Math.round(cents / 100))}`;
}
