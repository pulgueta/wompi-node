/**
 * In-memory demo state shared by the server functions and webhook routes.
 * Module-level state is intentional (same pattern as the settlement-attempt
 * cache this demo always used): a single dev/preview server instance is
 * enough for the sandbox showcase, and nothing here is a secret.
 */

export type ApiEventKind = "request" | "webhook";

export interface ApiEvent {
  id: number;
  method: string;
  path: string;
  status: number;
  /** Pretty-printed JSON, truncated to ~4000 chars. */
  body: string;
  kind: ApiEventKind;
  at: number;
}

export interface ProviderState {
  key: string;
  name: string;
  supplies: string;
  brebKey: string;
  brebKeyType: string;
  bank: string;
  /** Outstanding balance owed to the provider, in COP cents. */
  pendingCents: number;
}

export interface DispersionState {
  reference: string;
  wompiPayoutId: string;
  providerKey: string;
  brebKey: string;
  amountInCents: number;
  status: string;
  createdAt: number;
  /** Guards against settling the same dispersion twice (poll + webhook). */
  settled: boolean;
}

export interface PaymentState {
  reference: string;
  amountInCents: number;
  status: string;
  transactionId: string | null;
  updatedAt: number;
  /** Whether the latest status came from the webhook or an API poll. */
  source: "created" | "webhook" | "api";
}

const MAX_EVENTS = 50;
const MAX_BODY_CHARS = 4000;
const MAX_DISPERSIONS = 50;
const MAX_PAYMENTS = 100;

/** Design saldos are COP pesos; stored as cents (pesos * 100). */
const SEED_PROVIDERS: ProviderState[] = [
  {
    key: "p1",
    name: "Distribuciones Elías",
    supplies: "Pomadas y ceras",
    brebKey: "@elias123",
    brebKeyType: "ALPHANUMERIC",
    bank: "BANCO DAVIVIENDA (051)",
    pendingCents: 1_240_000 * 100,
  },
  {
    key: "p2",
    name: "Acme Soluciones S.A.S.",
    supplies: "Alcohol y desinfectantes",
    brebKey: "900123456",
    brebKeyType: "IDENTIFICATION",
    bank: "BANCO DAVIVIENDA (051)",
    pendingCents: 2_860_000 * 100,
  },
  {
    key: "p3",
    name: "Tienda Wompi Insumos",
    supplies: "Toallas y talcos",
    brebKey: "B00012345",
    brebKeyType: "ESTABLISHMENT_CODE",
    bank: "BANCOLOMBIA (007)",
    pendingCents: 780_000 * 100,
  },
  {
    key: "p4",
    name: "María López Ruiz",
    supplies: "Aceites artesanales",
    brebKey: "3001234567",
    brebKeyType: "PHONE",
    bank: "BANCO POPULAR (002)",
    pendingCents: 455_000 * 100,
  },
  {
    key: "p5",
    name: "Johan C. Pérez Gómez",
    supplies: "Lociones aftershave",
    brebKey: "ecolon@wompi.com",
    brebKeyType: "MAIL",
    bank: "BANCOLOMBIA (007)",
    pendingCents: 1_615_000 * 100,
  },
  {
    key: "p6",
    name: "Andrés F. García",
    supplies: "Geles y champús",
    brebKey: "1020304050",
    brebKeyType: "IDENTIFICATION",
    bank: "BANCO POPULAR (002)",
    pendingCents: 920_000 * 100,
  },
];

interface DemoStore {
  events: ApiEvent[];
  nextEventId: number;
  providers: ProviderState[];
  dispersions: DispersionState[];
  payments: Map<string, PaymentState>;
}

function createStore(): DemoStore {
  return {
    events: [],
    nextEventId: 1,
    providers: SEED_PROVIDERS.map((provider) => ({ ...provider })),
    dispersions: [],
    payments: new Map(),
  };
}

let store = createStore();

/** Test-only helper. */
export function resetStore() {
  store = createStore();
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export function listProviders(): ProviderState[] {
  return store.providers.map((provider) => ({ ...provider }));
}

export function settleProvider(providerKey: string, amountInCents: number) {
  if (
    !Number.isFinite(amountInCents) ||
    !Number.isInteger(amountInCents) ||
    amountInCents <= 0
  ) {
    return false;
  }
  const provider = store.providers.find((p) => p.key === providerKey);
  if (!provider) return false;

  provider.pendingCents = Math.max(0, provider.pendingCents - amountInCents);
  return true;
}

// ---------------------------------------------------------------------------
// Dispersions
// ---------------------------------------------------------------------------

export function recordDispersion(
  dispersion: Omit<DispersionState, "settled" | "createdAt">,
) {
  store.dispersions.unshift({
    ...dispersion,
    createdAt: Date.now(),
    settled: false,
  });
  if (store.dispersions.length > MAX_DISPERSIONS) {
    store.dispersions.length = MAX_DISPERSIONS;
  }
}

export function listDispersions(limit = 20): DispersionState[] {
  return store.dispersions.slice(0, limit).map((d) => ({ ...d }));
}

export function findDispersion(reference: string): DispersionState | null {
  return store.dispersions.find((d) => d.reference === reference) ?? null;
}

const TERMINAL_DISPERSION_STATUSES = new Set([
  "TOTAL_PAYMENT",
  "PARTIAL_PAYMENT",
  "NOT_APPROVED",
  "APPROVED",
  "PAYMENT",
  "CANCELED",
  "CANCELLED",
]);

function isTerminalDispersionStatus(status: string) {
  const normalized = status.toUpperCase();
  return (
    TERMINAL_DISPERSION_STATUSES.has(normalized) ||
    normalized.includes("FAIL") ||
    normalized.includes("ERROR") ||
    normalized.includes("REJECT")
  );
}

export function findActiveDispersion(
  providerKey: string,
): DispersionState | null {
  const dispersion = store.dispersions.find(
    (d) =>
      d.providerKey === providerKey &&
      !d.settled &&
      !isTerminalDispersionStatus(d.status),
  );
  return dispersion ? { ...dispersion } : null;
}

export function attachPayoutId(
  reference: string,
  wompiPayoutId: string,
): DispersionState | null {
  const dispersion = store.dispersions.find((d) => d.reference === reference);
  if (!dispersion) return null;

  dispersion.wompiPayoutId = wompiPayoutId;
  return { ...dispersion };
}

/**
 * Apply a status coming from the Payouts API or webhook. When the batch
 * reaches its fully-paid terminal state (TOTAL_PAYMENT) the matching
 * provider's pending balance is settled exactly once. Terminal states are
 * monotonic: a stale poll or delayed webhook can't revert one.
 */
export function applyDispersionStatus(
  lookup: { reference?: string; wompiPayoutId?: string },
  status: string,
): DispersionState | null {
  const normalizedStatus = status.toUpperCase();

  // Every identifier the caller supplies must agree with the record.
  const dispersion = store.dispersions.find((d) => {
    if (lookup.reference === undefined && lookup.wompiPayoutId === undefined) {
      return false;
    }
    if (lookup.reference !== undefined && d.reference !== lookup.reference) {
      return false;
    }
    if (
      lookup.wompiPayoutId !== undefined &&
      d.wompiPayoutId !== lookup.wompiPayoutId &&
      !(d.wompiPayoutId === "" && lookup.reference !== undefined)
    ) {
      return false;
    }
    return true;
  });
  if (!dispersion) return null;

  if (dispersion.wompiPayoutId === "" && lookup.wompiPayoutId !== undefined) {
    dispersion.wompiPayoutId = lookup.wompiPayoutId;
  }

  if (
    isTerminalDispersionStatus(dispersion.status) &&
    !isTerminalDispersionStatus(normalizedStatus)
  ) {
    return { ...dispersion };
  }

  dispersion.status = normalizedStatus;
  if (normalizedStatus === "TOTAL_PAYMENT" && !dispersion.settled) {
    dispersion.settled = true;
    settleProvider(dispersion.providerKey, dispersion.amountInCents);
  }
  return { ...dispersion };
}

// ---------------------------------------------------------------------------
// Payments (checkout orders)
// ---------------------------------------------------------------------------

export function recordPayment(reference: string, amountInCents: number) {
  store.payments.set(reference, {
    reference,
    amountInCents,
    status: "PENDING",
    transactionId: null,
    updatedAt: Date.now(),
    source: "created",
  });
  if (store.payments.size > MAX_PAYMENTS) {
    const oldest = store.payments.keys().next().value;
    if (oldest !== undefined) store.payments.delete(oldest);
  }
}

export function applyPaymentStatus(
  reference: string,
  update: {
    status: string;
    transactionId?: string;
    source: "webhook" | "api";
  },
): PaymentState | null {
  const payment = store.payments.get(reference);
  if (!payment) return null;

  // A webhook-confirmed final status wins over a later API poll, and no
  // recorded final status ever regresses to PENDING.
  if (payment.source === "webhook" && payment.status !== "PENDING") {
    return { ...payment };
  }
  if (payment.status !== "PENDING" && update.status === "PENDING") {
    return { ...payment };
  }
  payment.status = update.status;
  payment.transactionId = update.transactionId ?? payment.transactionId;
  payment.updatedAt = Date.now();
  payment.source = update.source;
  return { ...payment };
}

export function getPayment(reference: string): PaymentState | null {
  const payment = store.payments.get(reference);
  return payment ? { ...payment } : null;
}
