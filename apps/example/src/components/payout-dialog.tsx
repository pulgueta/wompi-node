import { useRef, useState } from "react";

import { Check } from "lucide-react";

import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { BREB_ERROR_KEYS, formatCOP } from "#/lib/catalog";
import { usePoll } from "#/lib/use-poll";
import { cn } from "#/lib/utils";
import {
  createDispersion,
  getPayoutStatus,
  resolveKey,
} from "#/server/payouts";

export interface PayoutTarget {
  providerKey: string;
  providerName: string;
  brebKey: string;
  brebKeyType: string;
  amountCents: number;
}

interface KeyResolution {
  holderName: string;
  keyType: string;
  bank: string;
}

interface KeyError {
  code: string;
  statusCode: number;
  message: string;
}

type SimulatedOutcome = "APPROVED" | "FAILED";

const TERMINAL_PAYOUT_STATUSES = new Set([
  "TOTAL_PAYMENT",
  "PARTIAL_PAYMENT",
  "NOT_APPROVED",
  "APPROVED",
  "PAYMENT",
  "CANCELED",
  "CANCELLED",
]);

function isTerminalPayoutStatus(status: string) {
  const normalized = status.toUpperCase();
  return (
    TERMINAL_PAYOUT_STATUSES.has(normalized) ||
    normalized.includes("FAIL") ||
    normalized.includes("ERROR") ||
    normalized.includes("REJECT")
  );
}

export function PayoutDialog({
  target,
  onClose,
}: {
  target: PayoutTarget;
  onClose: () => void;
}) {
  const [keyValue, setKeyValue] = useState(target.brebKey);
  const [amountPesos, setAmountPesos] = useState(
    String(Math.round(target.amountCents / 100)),
  );
  const [resolution, setResolution] = useState<KeyResolution | null>(null);
  const [keyError, setKeyError] = useState<KeyError | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [simulate, setSimulate] = useState<SimulatedOutcome>("APPROVED");
  const [reference, setReference] = useState<string | null>(null);
  const [isDispersing, setIsDispersing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [pollingStopped, setPollingStopped] = useState(false);
  const consecutivePollErrors = useRef(0);

  // The payouts webhook (/api/payouts-webhook) settles the dispersion when
  // it lands; this poll reconciles against the Payouts API in the meantime.
  const statusResult = usePoll(
    async () => {
      if (!reference) return null;
      try {
        const response = await getPayoutStatus({ data: { reference } });
        if (response.error) {
          consecutivePollErrors.current += 1;
          if (consecutivePollErrors.current >= 3) {
            setKeyError({
              code: response.error.code,
              statusCode: response.error.statusCode ?? 0,
              message: response.error.message,
            });
            setPollingStopped(true);
          }
          return response;
        }

        consecutivePollErrors.current = 0;
        const status = response.data.status.toUpperCase();
        if (isTerminalPayoutStatus(status)) setIsDone(true);
        return response;
      } catch (cause) {
        consecutivePollErrors.current += 1;
        if (consecutivePollErrors.current >= 3) {
          setKeyError({
            code: "ERROR",
            statusCode: 500,
            message:
              cause instanceof Error
                ? cause.message
                : "Error consultando el estado del payout.",
          });
          setPollingStopped(true);
        }
        return null;
      }
    },
    2500,
    reference !== null && !isDone && !pollingStopped,
  );

  const activeStatus = statusResult?.data?.status.toUpperCase() ?? "PENDING";
  // Only a fully-paid batch counts as approved — PARTIAL_PAYMENT and other
  // in-between terminal states get shown as-is, never as a success.
  const isApproved = isDone && activeStatus === "TOTAL_PAYMENT";
  const isFailed =
    isDone &&
    (activeStatus === "NOT_APPROVED" ||
      activeStatus === "CANCELED" ||
      activeStatus === "CANCELLED" ||
      activeStatus.includes("FAIL") ||
      activeStatus.includes("ERROR") ||
      activeStatus.includes("REJECT"));

  const amountCents =
    (Number.parseInt(amountPesos.replace(/\D/g, ""), 10) || 0) * 100;

  const lookup = async () => {
    setIsResolving(true);
    setResolution(null);
    setKeyError(null);
    try {
      const { error, data } = await resolveKey({
        data: { key: keyValue.trim() },
      });
      if (error) {
        setKeyError({
          code: error.code,
          statusCode: error.statusCode ?? 0,
          message: error.message,
        });
      } else {
        setResolution({
          holderName: data.holderName,
          keyType: data.keyType,
          bank: data.financialEntityName ?? "—",
        });
      }
    } catch (cause) {
      setKeyError({
        code: "ERROR",
        statusCode: 500,
        message:
          cause instanceof Error
            ? cause.message
            : "Error consultando la llave.",
      });
    } finally {
      setIsResolving(false);
    }
  };

  const startDispersion = async () => {
    if (!resolution || amountCents <= 0 || isDispersing) return;
    setIsDispersing(true);
    try {
      const { error, data } = await createDispersion({
        data: {
          providerKey: target.providerKey,
          keyValue: keyValue.trim(),
          amountInCents: amountCents,
          simulate,
        },
      });
      if (error) {
        setKeyError({
          code: error.code,
          statusCode: error.statusCode ?? 0,
          message: error.message,
        });
      } else {
        consecutivePollErrors.current = 0;
        setPollingStopped(false);
        setKeyError(null);
        setReference(data.reference);
      }
    } catch (cause) {
      setKeyError({
        code: "ERROR",
        statusCode: 500,
        message:
          cause instanceof Error ? cause.message : "Error creando el payout.",
      });
    } finally {
      setIsDispersing(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="w-[480px] max-w-full gap-0 border-0 bg-background p-0 shadow-lg">
        <DialogHeader className="flex-row items-center border-b-2 border-foreground px-5 py-3.5">
          <div>
            <DialogTitle className="text-[15px] font-extrabold">
              DISPERSIÓN BRE-B
            </DialogTitle>
            <DialogDescription className="text-[11px] text-neutral-800">
              {target.providerName}
            </DialogDescription>
          </div>
        </DialogHeader>

        {reference === null && (
          <div className="flex flex-col gap-3 px-5 py-[18px]">
            <div>
              <Label className="mb-1.5 text-xs text-neutral-700">
                Llave Bre-B del proveedor
              </Label>
              <Input
                value={keyValue}
                onChange={(event) => {
                  setKeyValue(event.target.value);
                  setResolution(null);
                  setKeyError(null);
                }}
                className="font-mono"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10.5px] text-neutral-800">
                Probar errores:
              </span>
              {BREB_ERROR_KEYS.map((errorKey) => (
                <button
                  key={errorKey}
                  type="button"
                  onClick={() => {
                    setKeyValue(errorKey);
                    setResolution(null);
                    setKeyError(null);
                  }}
                  className="border px-2 py-[3px] font-mono text-[10px] text-neutral-900 transition-colors hover:border-primary hover:text-brand-700"
                >
                  {errorKey}
                </button>
              ))}
            </div>
            <div>
              <Label className="mb-1.5 text-xs text-neutral-700">
                Monto a dispersar (COP)
              </Label>
              <Input
                inputMode="numeric"
                value={amountPesos}
                onChange={(event) => setAmountPesos(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className="min-h-[42px] w-full"
              onClick={() => void lookup()}
              disabled={isResolving || keyValue.trim().length === 0}
            >
              {isResolving
                ? "Consultando el directorio…"
                : "Consultar llave en el directorio"}
            </Button>

            {resolution && (
              <>
                <div className="border bg-neutral-100 px-3.5 py-3 text-[12.5px] leading-relaxed">
                  <ResolutionRow
                    label="Titular"
                    value={resolution.holderName}
                  />
                  <ResolutionRow label="Entidad" value={resolution.bank} />
                  <div className="flex justify-between">
                    <span className="text-neutral-800">Tipo de llave</span>
                    <code className="font-mono text-[11.5px]">
                      {resolution.keyType}
                    </code>
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] text-neutral-800">
                    Resultado sandbox de la transacción
                  </p>
                  <div className="inline-flex border">
                    {(["APPROVED", "FAILED"] as const).map((outcome, index) => (
                      <button
                        key={outcome}
                        type="button"
                        onClick={() => setSimulate(outcome)}
                        className={cn(
                          "px-3 py-[7px] text-xs font-semibold tracking-[0.06em]",
                          index > 0 && "border-l",
                          simulate === outcome
                            ? "bg-foreground text-background"
                            : "hover:bg-neutral-100",
                        )}
                      >
                        {outcome === "APPROVED" ? "APROBADA" : "FALLIDA"}
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  className="min-h-[46px] w-full text-sm"
                  onClick={() => void startDispersion()}
                  disabled={isDispersing || amountCents <= 0}
                >
                  {isDispersing
                    ? "Creando el payout…"
                    : `Dispersar ${formatCOP(amountCents)}`}
                </Button>
              </>
            )}

            {keyError && (
              <div className="border border-primary bg-brand-100 px-3.5 py-3 text-[12.5px] leading-relaxed text-brand-800">
                <p className="mb-0 font-extrabold">
                  {keyError.code} · HTTP {keyError.statusCode}
                </p>
                <p className="mb-0">{keyError.message}</p>
              </div>
            )}
          </div>
        )}

        {reference !== null && !isDone && (
          <div className="flex flex-col gap-3 px-5 py-7">
            <p className="mb-0 flex items-center gap-2.5 text-lg font-extrabold">
              <span aria-hidden className="size-3 animate-blink bg-primary" />
              Payout PENDING
            </p>
            <p className="mb-0 text-[13px] leading-relaxed text-neutral-800">
              Dispersión <code className="font-mono text-xs">{reference}</code>{" "}
              creada. Esperando la confirmación del webhook de Payouts…
            </p>
            {keyError && (
              <div className="border border-primary bg-brand-100 px-3.5 py-3 text-[12.5px] leading-relaxed text-brand-800">
                <p className="mb-0 font-extrabold">
                  {keyError.code} · HTTP {keyError.statusCode}
                </p>
                <p className="mb-0">{keyError.message}</p>
              </div>
            )}
          </div>
        )}

        {reference !== null && isDone && (
          <div className="flex flex-col gap-3 px-5 py-6">
            <p className="mb-0 flex items-center gap-2.5 text-xl font-extrabold">
              {isApproved ? (
                <Check aria-hidden className="size-6 text-primary" />
              ) : (
                <span aria-hidden className="size-3 bg-brand-700" />
              )}
              Dispersión{" "}
              {isApproved ? "APROBADA" : isFailed ? "FALLIDA" : activeStatus}
            </p>
            <p className="mb-0 text-[13px] leading-relaxed text-neutral-800">
              {isApproved ? (
                <>
                  {formatCOP(amountCents)} enviados a{" "}
                  {resolution?.holderName ?? target.providerName} vía llave{" "}
                  <code className="font-mono text-xs">{keyValue}</code>.
                </>
              ) : isFailed ? (
                <>
                  El estado final fue {activeStatus} (simulación sandbox).
                  {statusResult?.data?.transactionFailureReason
                    ? ` Motivo: ${statusResult.data.transactionFailureReason}.`
                    : ""}{" "}
                  El saldo pendiente del proveedor se conserva.
                </>
              ) : (
                <>
                  El batch terminó en estado {activeStatus}: requiere
                  conciliación manual. El saldo pendiente del proveedor se
                  conserva hasta que el batch quede totalmente pagado.
                </>
              )}
            </p>
            <Button className="min-h-11 w-full" onClick={onClose}>
              Listo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResolutionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-800">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
