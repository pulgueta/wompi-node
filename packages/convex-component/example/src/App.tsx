import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useWompiTokenizer } from "@pulgueta/wompi-convex/react";
import { api } from "../convex/_generated/api";
import "./App.css";

// ---------------------------------------------------------------- helpers

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const formatCOP = (cents: number) => cop.format(cents / 100);

const dateFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
const dateTimeFmt = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const relative = (ms: number) => {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "hace un momento";
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)} h`;
  return dateTimeFmt.format(ms);
};

const INTERVAL_LABEL: Record<string, string> = {
  day: "día",
  week: "semana",
  month: "mes",
  year: "año",
};

const PAYMENT_CHIP: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pendiente", tone: "chip-pending" },
  approved: { label: "Aprobado", tone: "chip-ok" },
  declined: { label: "Rechazado", tone: "chip-danger" },
  error: { label: "Error", tone: "chip-danger" },
  voided: { label: "Anulado", tone: "chip-neutral" },
  expired: { label: "Expirado", tone: "chip-neutral" },
};

const SUBSCRIPTION_CHIP: Record<string, { label: string; tone: string }> = {
  active: { label: "Activa", tone: "chip-ok" },
  trialing: { label: "En prueba", tone: "chip-brand" },
  past_due: { label: "En mora", tone: "chip-warn" },
  unpaid: { label: "Suspendida", tone: "chip-danger" },
  canceled: { label: "Cancelada", tone: "chip-neutral" },
  incomplete: { label: "Incompleta", tone: "chip-neutral" },
};

function Chip({
  map,
  status,
}: {
  map: Record<string, { label: string; tone: string }>;
  status: string;
}) {
  const def = map[status] ?? { label: status, tone: "chip-neutral" };
  return <span className={`chip ${def.tone}`}>{def.label}</span>;
}

type Product = {
  _id: string;
  key: string;
  name: string;
  description?: string;
  type: "one_time" | "subscription";
  amountInCents: number;
  interval?: string;
  trialDays?: number;
};

type Payment = {
  _id: string;
  _creationTime: number;
  reference: string;
  kind: "checkout" | "subscription";
  status: string;
  amountInCents: number;
  description?: string;
  attempt?: number;
  paymentMethodType?: string;
  failureReason?: string;
};

type Subscription = {
  _id: string;
  status: string;
  productKey: string;
  amountInCents: number;
  interval: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  nextChargeAt?: number;
  cancelAtPeriodEnd: boolean;
  trialEndsAt?: number;
  failedAttempts: number;
  lastError?: string;
  pendingProductKey?: string;
  product: Product | null;
};

// ------------------------------------------------------------- storefront

function Storefront({ products }: { products: Product[] }) {
  const checkout = useAction(api.wompi.checkout);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = async (productKey: string) => {
    setBusy(productKey);
    setError(null);
    try {
      const { url } = await checkout({
        productKey,
        redirectUrl: window.location.origin + window.location.pathname,
      });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el checkout");
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="productos">
      <div className="section-head">
        <h2 id="productos">Productos</h2>
        <span className="hint">pago único · redirige al checkout de Wompi</span>
      </div>
      <div className="grid-products">
        {products.map((p) => (
          <article className="product" key={p._id}>
            <h3>{p.name}</h3>
            <p className="desc">{p.description}</p>
            <div className="price">{formatCOP(p.amountInCents)}</div>
            <button
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={() => void buy(p.key)}
            >
              {busy === p.key && <span className="spinner" aria-hidden />}
              {busy === p.key ? "Redirigiendo…" : "Pagar con Wompi"}
            </button>
          </article>
        ))}
      </div>
      {error && (
        <p className="form-error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </section>
  );
}

// -------------------------------------------------------------- card form

const TEST_CARDS = [
  { label: "4242 · aprueba", number: "4242 4242 4242 4242" },
  { label: "4111 · rechaza", number: "4111 1111 1111 1111" },
];

function CardForm({
  plan,
  onDone,
  onClose,
}: {
  plan: Product;
  onDone: () => void;
  onClose: () => void;
}) {
  const { tokenizeCard, acceptancePermalink, ready } = useWompiTokenizer(
    api.wompi.getConfig,
  );
  const subscribe = useAction(api.wompi.subscribe);

  const [number, setNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvc, setCvc] = useState("");
  const [holder, setHolder] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [phase, setPhase] = useState<"idle" | "tokenizing" | "subscribing">("idle");
  const [error, setError] = useState<string | null>(null);

  const formatNumber = (value: string) =>
    value
      .replace(/\D/g, "")
      .slice(0, 16)
      .replace(/(.{4})/g, "$1 ")
      .trim();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPhase("tokenizing");
    try {
      const token = await tokenizeCard({
        number,
        cvc,
        expMonth: expMonth.padStart(2, "0"),
        expYear,
        cardHolder: holder,
      });

      setPhase("subscribing");
      const result = await subscribe({
        productKey: plan.key,
        token: token.id,
        paymentMethod: {
          brand: token.brand,
          lastFour: token.last_four,
          expMonth: token.exp_month,
          expYear: token.exp_year,
          cardHolder: token.card_holder,
        },
      });

      const status = result.payment?.status;
      if (status && status !== "approved" && status !== "pending") {
        setError(
          status === "declined"
            ? "La tarjeta fue rechazada por el emisor. Prueba con la 4242."
            : (result.payment?.failureReason ?? "El cobro inicial falló."),
        );
        setPhase("idle");
        return;
      }

      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la suscripción");
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";
  const trial = (plan.trialDays ?? 0) > 0;

  return (
    <div className="cardform" role="region" aria-label={`Suscripción a ${plan.name}`}>
      <div className="cardform-summary">
        <h3>Suscribirse a {plan.name}</h3>
        <div className="picked">
          <span>
            {trial
              ? `${plan.trialDays} días gratis, luego se cobra cada ${INTERVAL_LABEL[plan.interval ?? "month"]}`
              : `Primer cobro hoy, luego cada ${INTERVAL_LABEL[plan.interval ?? "month"]}`}
          </span>
          <span className="amount">{formatCOP(plan.amountInCents)}</span>
        </div>
        <div className="testcards">
          <span className="label">Tarjetas sandbox (cualquier fecha futura y CVC):</span>
          <div className="testcard-row">
            {TEST_CARDS.map((card) => (
              <button
                type="button"
                key={card.number}
                className="testcard"
                onClick={() => {
                  setNumber(card.number);
                  setExpMonth("12");
                  setExpYear("29");
                  setCvc("123");
                  setHolder((h) => h || "USUARIO DEMO");
                }}
              >
                {card.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <form onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="cc-name">Titular</label>
          <input
            id="cc-name"
            autoComplete="cc-name"
            placeholder="Como aparece en la tarjeta"
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="cc-number">Número de tarjeta</label>
          <input
            id="cc-number"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="4242 4242 4242 4242"
            value={number}
            onChange={(e) => setNumber(formatNumber(e.target.value))}
            required
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="cc-month">Mes</label>
            <input
              id="cc-month"
              inputMode="numeric"
              placeholder="MM"
              maxLength={2}
              value={expMonth}
              onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="cc-year">Año</label>
            <input
              id="cc-year"
              inputMode="numeric"
              placeholder="AA"
              maxLength={2}
              value={expYear}
              onChange={(e) => setExpYear(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="cc-cvc">CVC</label>
            <input
              id="cc-cvc"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              maxLength={4}
              value={cvc}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
        </div>

        <label className="acceptance">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            required
          />
          <span>
            Acepto los{" "}
            {acceptancePermalink ? (
              <a href={acceptancePermalink} target="_blank" rel="noreferrer">
                términos y condiciones
              </a>
            ) : (
              "términos y condiciones"
            )}{" "}
            y autorizo el cobro recurrente a esta tarjeta.
          </span>
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button className="btn btn-primary" disabled={!ready || !accepted || busy}>
            {busy && <span className="spinner" aria-hidden />}
            {phase === "tokenizing"
              ? "Tokenizando tarjeta…"
              : phase === "subscribing"
                ? "Creando suscripción…"
                : trial
                  ? "Empezar prueba gratis"
                  : "Suscribirse"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ plans

function Plans({
  plans,
  subscription,
}: {
  plans: Product[];
  subscription: Subscription | null | undefined;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const changePlan = useMutation(api.wompi.changeSubscription);
  const [changing, setChanging] = useState<string | null>(null);
  const selectedPlan = plans.find((p) => p.key === selected) ?? null;

  const change = async (productKey: string) => {
    if (!subscription) return;
    setChanging(productKey);
    try {
      await changePlan({ subscriptionId: subscription._id, productKey });
    } finally {
      setChanging(null);
    }
  };

  return (
    <section aria-labelledby="planes">
      <div className="section-head">
        <h2 id="planes">Planes</h2>
        <span className="hint">suscripción con tarjeta guardada · renovación automática</span>
      </div>
      <div className="grid-plans">
        {plans.map((plan) => {
          const isCurrent = subscription?.productKey === plan.key;
          const isPendingSwitch = subscription?.pendingProductKey === plan.key;
          return (
            <article
              className="plan"
              key={plan._id}
              data-current={isCurrent}
              data-selected={selected === plan.key}
            >
              <div className="plan-name">
                {plan.name}
                {isCurrent && <span className="chip chip-brand">Tu plan</span>}
                {isPendingSwitch && <span className="chip chip-pending">Próximo</span>}
              </div>
              <p className="desc">{plan.description}</p>
              {(plan.trialDays ?? 0) > 0 && (
                <span className="trial-note">{plan.trialDays} días de prueba gratis</span>
              )}
              <div className="price">
                {formatCOP(plan.amountInCents)}{" "}
                <small>/ {INTERVAL_LABEL[plan.interval ?? "month"]}</small>
              </div>
              {subscription && !isCurrent ? (
                <button
                  className="btn btn-ghost"
                  disabled={changing !== null || isPendingSwitch}
                  onClick={() => void change(plan.key)}
                >
                  {changing === plan.key
                    ? "Programando cambio…"
                    : isPendingSwitch
                      ? "Cambio programado"
                      : "Cambiar a este plan"}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={isCurrent}
                  onClick={() => setSelected(plan.key)}
                >
                  {isCurrent ? "Suscripción activa" : "Suscribirse"}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {selectedPlan && !subscription && (
        <CardForm
          plan={selectedPlan}
          onClose={() => setSelected(null)}
          onDone={() => setSelected(null)}
        />
      )}
    </section>
  );
}

// --------------------------------------------------------- subscription UI

function SubscriptionPanel({
  subscription,
  onBillingRun,
}: {
  subscription: Subscription | null | undefined;
  onBillingRun: (summary: unknown) => void;
}) {
  const cancel = useMutation(api.wompi.cancelSubscription);
  const resume = useMutation(api.wompi.resumeSubscription);
  const simulate = useAction(api.dev.simulateRenewal);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  if (subscription === undefined) return null;

  if (subscription === null) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h2>Tu suscripción</h2>
        </div>
        <div className="empty">
          Aún no tienes una suscripción. Elige un plan y paga con la tarjeta sandbox
          4242 4242 4242 4242: el estado aparecerá aquí en tiempo real, sin recargar.
        </div>
      </div>
    );
  }

  const s = subscription;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Tu suscripción</h2>
        <Chip map={SUBSCRIPTION_CHIP} status={s.status} />
      </div>

      {s.status === "past_due" && (
        <div className="dunning">
          El último cobro falló ({s.failedAttempts}{" "}
          {s.failedAttempts === 1 ? "intento" : "intentos"}). Se reintentará
          automáticamente{s.nextChargeAt ? ` el ${dateTimeFmt.format(s.nextChargeAt)}` : ""}.
          {s.lastError ? ` Motivo: ${s.lastError}` : ""}
        </div>
      )}
      {s.status === "unpaid" && (
        <div className="dunning">
          Los reintentos de cobro se agotaron y el acceso quedó suspendido. Vuelve a
          suscribirte para reactivar.
        </div>
      )}

      <dl>
        <div className="kv">
          <dt>Plan</dt>
          <dd>
            {s.product?.name ?? s.productKey} · {formatCOP(s.amountInCents)}/
            {INTERVAL_LABEL[s.interval]}
          </dd>
        </div>
        <div className="kv">
          <dt>Periodo actual</dt>
          <dd>
            {dateFmt.format(s.currentPeriodStart)} → {dateFmt.format(s.currentPeriodEnd)}
          </dd>
        </div>
        {s.status === "trialing" && s.trialEndsAt && (
          <div className="kv">
            <dt>La prueba termina</dt>
            <dd>{dateTimeFmt.format(s.trialEndsAt)}</dd>
          </div>
        )}
        <div className="kv">
          <dt>{s.cancelAtPeriodEnd ? "Se cancela" : "Próximo cobro"}</dt>
          <dd>{s.nextChargeAt ? dateTimeFmt.format(s.nextChargeAt) : "—"}</dd>
        </div>
        {s.pendingProductKey && (
          <div className="kv">
            <dt>Cambio de plan</dt>
            <dd>a “{s.pendingProductKey}” en la próxima renovación</dd>
          </div>
        )}
      </dl>

      <div className="panel-actions">
        {s.cancelAtPeriodEnd ? (
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy !== null}
            onClick={() => void run("resume", () => resume({ subscriptionId: s._id }))}
          >
            {busy === "resume" ? "Reanudando…" : "Reanudar suscripción"}
          </button>
        ) : (
          ["active", "trialing", "past_due"].includes(s.status) && (
            <button
              className="btn btn-danger-ghost btn-sm"
              disabled={busy !== null}
              onClick={() => void run("cancel", () => cancel({ subscriptionId: s._id }))}
            >
              {busy === "cancel" ? "Cancelando…" : "Cancelar al final del periodo"}
            </button>
          )
        )}
        {["active", "trialing", "past_due"].includes(s.status) && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy !== null}
            onClick={() =>
              void run("simulate", async () => {
                const summary = await simulate({ subscriptionId: s._id });
                onBillingRun(summary);
              })
            }
          >
            {busy === "simulate" ? "Cobrando…" : "⏩ Simular renovación"}
          </button>
        )}
      </div>
      <p className="panel-note">
        “Simular renovación” adelanta el próximo cobro y ejecuta el ciclo de billing: el
        cobro a la tarjeta guardada sucede de verdad en el sandbox.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- timeline

function Timeline({ payments }: { payments: Payment[] | undefined }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Actividad</h2>
      </div>
      {!payments || payments.length === 0 ? (
        <div className="empty">
          Sin pagos todavía. Compra un producto o suscríbete: cada cambio de estado
          (webhook, conciliación o renovación) aparece aquí al instante.
        </div>
      ) : (
        <div className="timeline">
          {payments.map((p) => (
            <div className="payment-row" key={p._id}>
              <Chip map={PAYMENT_CHIP} status={p.status} />
              <div className="payment-main">
                <span className="payment-title">
                  {p.description ?? p.reference}
                  {p.kind === "subscription" && (p.attempt ?? 0) > 0
                    ? ` · reintento ${p.attempt}`
                    : ""}
                </span>
              </div>
              <div className="payment-amount">{formatCOP(p.amountInCents)}</div>
              <div className="payment-sub">
                <span>{p.kind === "checkout" ? "compra" : "suscripción"}</span>
                <span>{p.reference}</span>
                {p.failureReason && <span>{p.failureReason}</span>}
              </div>
              <div className="payment-when">{relative(p._creationTime)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- app

type BillingSummary = {
  approved?: number;
  declined?: number;
  claimed?: number;
  finalizedCancellations?: number;
} | null;

export default function App() {
  const products = useQuery(api.wompi.listProducts, {}) as Product[] | undefined;
  const subscription = useQuery(api.wompi.getCurrentSubscription, {}) as
    | Subscription
    | null
    | undefined;
  const payments = useQuery(api.wompi.listPayments, { limit: 12 }) as
    | Payment[]
    | undefined;

  const confirm = useAction(api.wompi.confirmTransaction);
  const runBilling = useAction(api.dev.runBilling);

  const [returnState, setReturnState] = useState<
    | { phase: "confirming" }
    | { phase: "done"; status: string; reference?: string; description?: string }
    | null
  >(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummary>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const confirmed = useRef(false);

  // Returning from Wompi Web Checkout: ?id=<transactionId>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get("id");
    if (!transactionId || confirmed.current) return;
    confirmed.current = true;

    setReturnState({ phase: "confirming" });
    window.history.replaceState({}, "", window.location.pathname);

    confirm({ transactionId })
      .then((outcome) => {
        setReturnState({
          phase: "done",
          status: (outcome?.payment?.status as string) ?? "pending",
          reference: outcome?.payment?.reference as string | undefined,
          description: outcome?.payment?.description as string | undefined,
        });
      })
      .catch(() => setReturnState(null));
  }, [confirm]);

  const oneTime = useMemo(
    () => (products ?? []).filter((p) => p.type === "one_time"),
    [products],
  );
  const plans = useMemo(
    () => (products ?? []).filter((p) => p.type === "subscription"),
    [products],
  );

  const triggerBilling = useCallback(async () => {
    setBillingBusy(true);
    try {
      setBillingSummary((await runBilling({})) as BillingSummary);
    } finally {
      setBillingBusy(false);
    }
  }, [runBilling]);

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <span className="wordmark">
            tienda<span>wompi</span>
          </span>
          <div className="topbar-meta">
            <span className="chip chip-warn">Sandbox</span>
            <span className="live-dot">Convex en vivo</span>
          </div>
        </div>
      </header>

      <main className="shell">
        <div className="hero">
          <h1>Cobra productos y suscripciones con Wompi, en tiempo real.</h1>
          <p>
            Demo de <code>@pulgueta/wompi-convex</code>: checkout redirigido, tarjetas
            guardadas, renovaciones y webhooks. Todo lo que ves sale del sandbox real
            de Wompi y se actualiza solo.
          </p>
        </div>

        {returnState && (
          <div className="banner" role="status">
            {returnState.phase === "confirming" ? (
              <>
                <Chip map={PAYMENT_CHIP} status="pending" />
                <span>Confirmando tu pago con Wompi…</span>
              </>
            ) : (
              <>
                <Chip map={PAYMENT_CHIP} status={returnState.status} />
                <span>
                  {returnState.status === "approved"
                    ? `¡Listo! Tu pago${returnState.description ? ` de ${returnState.description}` : ""} fue aprobado.`
                    : returnState.status === "pending"
                      ? "Tu pago quedó pendiente; el webhook lo confirmará en un momento."
                      : "El pago no fue aprobado. Puedes intentarlo de nuevo."}
                </span>
                {returnState.reference && (
                  <span className="ref">{returnState.reference}</span>
                )}
                <button onClick={() => setReturnState(null)} aria-label="Cerrar aviso">
                  ×
                </button>
              </>
            )}
          </div>
        )}

        {products === undefined ? (
          <div className="empty">Cargando catálogo…</div>
        ) : (
          <>
            <Storefront products={oneTime} />
            <Plans plans={plans} subscription={subscription} />
            <section aria-label="Estado de cuenta" className="duo">
              <SubscriptionPanel
                subscription={subscription}
                onBillingRun={(s) => setBillingSummary(s as BillingSummary)}
              />
              <Timeline payments={payments} />
            </section>
          </>
        )}
      </main>

      <footer className="demobar">
        <div className="shell demobar-inner">
          <span className="cards">4242… aprueba · 4111… rechaza</span>
          <span>Tarjetas de prueba del sandbox de Wompi</span>
          <span className="grow" />
          {billingSummary && (
            <span className="summary">
              último billing: {billingSummary.claimed ?? 0} cobros ·{" "}
              {billingSummary.approved ?? 0} aprobados · {billingSummary.declined ?? 0}{" "}
              rechazados
            </span>
          )}
          <button
            className="btn btn-ghost btn-sm"
            disabled={billingBusy}
            onClick={() => void triggerBilling()}
          >
            {billingBusy ? "Ejecutando…" : "Ejecutar billing"}
          </button>
        </div>
      </footer>
    </>
  );
}
