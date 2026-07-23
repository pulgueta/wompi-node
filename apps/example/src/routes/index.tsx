import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  readCheckoutBinding,
  saveCheckoutBinding,
} from "#/lib/checkout-storage";
import type { CheckoutBinding } from "#/lib/checkout-storage";
import { getPayoutPresentation } from "#/lib/payout-presentation";
import {
  createCheckoutSession,
  getCheckoutTransaction,
} from "#/server/checkout";
import type { CheckoutTransactionDto } from "#/server/checkout";
import {
  createDispersion,
  getPayoutStatus,
  listAccounts,
  listBanks,
  resolveKey,
  SETTLEMENT_AMOUNT_IN_CENTS,
  SUPPLIER_EMAIL,
  SUPPLIER_LEGAL_ID,
  SUPPLIER_LEGAL_ID_TYPE,
  SUPPLIER_NAME,
  SUPPLIER_PERSON_TYPE,
} from "#/server/payouts";
import type {
  AccountDto,
  BankDto,
  CreateResultDto,
  KeyResolutionDto,
  PayoutRail,
  PayoutStatusDto,
} from "#/server/payouts";

const ORDER_AMOUNT_IN_CENTS = 4_950_000;
const ORDER_NAME = "Barber essentials kit";
const CUSTOMER_NAME = "Laura Mendoza";
const CUSTOMER_EMAIL = "laura@example.com";
const BREB_TEST_KEY = "@elias123";

const ACCOUNT_TYPES = ["AHORROS", "CORRIENTE", "DEPOSITO_ELECTRONICO"] as const;

type SettlementRail = "breb" | "bank";
type AccountType = (typeof ACCOUNT_TYPES)[number];
type PayoutResult = CreateResultDto & {
  payoutId: string;
  rail: PayoutRail;
};

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: Home,
});

function formatCents(value: number | null | undefined) {
  return value == null ? "Not reported" : copFormatter.format(value / 100);
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}

function statusTone(status: string) {
  if (["APPROVED", "TOTAL_PAYMENT", "SUCCESS", "COMPLETED"].includes(status)) {
    return "success";
  }

  if (["DECLINED", "ERROR", "FAILED", "REJECTED"].includes(status)) {
    return "danger";
  }

  return "pending";
}

function Home() {
  const { id: returnedTransactionId } = Route.useSearch();
  const [transaction, setTransaction] = useState<CheckoutTransactionDto | null>(
    null,
  );
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [checkoutBinding, setCheckoutBinding] =
    useState<CheckoutBinding | null>(null);
  const [checkoutBindingReady, setCheckoutBindingReady] = useState(false);
  const transactionRequestId = useRef(0);
  const checkoutApproved = transaction?.status === "APPROVED";

  async function refreshTransaction(
    transactionId: string,
    binding: CheckoutBinding,
  ) {
    const requestId = ++transactionRequestId.current;
    setTransactionLoading(true);
    setTransactionError(null);

    try {
      const result = await getCheckoutTransaction({
        data: {
          transactionId,
          expectedReference: binding.reference,
          orderProof: binding.orderProof,
        },
      });

      if (requestId !== transactionRequestId.current) return;

      if (result.error) {
        setTransaction(null);
        setTransactionError(getErrorMessage(result.error));
      } else if (result.data) {
        setTransaction(result.data);
      } else {
        setTransaction(null);
        setTransactionError("Wompi did not return a transaction.");
      }
    } catch (error) {
      if (requestId === transactionRequestId.current) {
        setTransaction(null);
        setTransactionError(getErrorMessage(error));
      }
    } finally {
      if (requestId === transactionRequestId.current) {
        setTransactionLoading(false);
      }
    }
  }

  useEffect(() => {
    setCheckoutBinding(readCheckoutBinding(window.sessionStorage));
    setCheckoutBindingReady(true);
  }, []);

  useEffect(() => {
    if (!returnedTransactionId || !checkoutBindingReady) return;

    if (!checkoutBinding) {
      setTransaction(null);
      setTransactionError(
        "This browser no longer has the launched order reference. Start another checkout.",
      );
      return;
    }

    void refreshTransaction(returnedTransactionId, checkoutBinding);
    return () => {
      transactionRequestId.current += 1;
    };
  }, [returnedTransactionId, checkoutBindingReady, checkoutBinding]);

  async function launchCheckout() {
    setLaunching(true);
    setLaunchError(null);

    try {
      const result = await createCheckoutSession();

      if (result.error) {
        setLaunchError(getErrorMessage(result.error));
      } else if (result.data) {
        const binding = {
          reference: result.data.reference,
          orderProof: result.data.orderProof,
        };
        saveCheckoutBinding(window.sessionStorage, binding);
        setCheckoutBinding(binding);
        window.location.assign(result.data.checkoutUrl);
      } else {
        setLaunchError("Wompi did not return a checkout URL.");
      }
    } catch (error) {
      setLaunchError(getErrorMessage(error));
    } finally {
      setLaunching(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <a className="wordmark" href="/">
          Wompi SDK
        </a>
        <span className="environment-badge">Sandbox</span>
      </header>

      <main className="workspace">
        <header className="page-intro">
          <p className="eyebrow">Checkout to settlement</p>
          <h1>One order, both sides of the SDK.</h1>
          <p>
            Charge the customer with hosted Checkout, then settle the supplier
            through BRE-B.
          </p>
        </header>

        <FlowProgress
          checkoutStatus={transaction?.status ?? null}
          settlementAvailable={checkoutApproved}
        />

        <div className="commerce-layout">
          <div className="flow-column">
            <section className="task-step" aria-labelledby="checkout-heading">
              <StepHeading
                number="1"
                title="Customer checkout"
                id="checkout-heading"
                meta={checkoutApproved ? "Approved" : "COP 49,500"}
              />

              {returnedTransactionId ? (
                <CheckoutResult
                  transactionId={returnedTransactionId}
                  transaction={transaction}
                  loading={transactionLoading}
                  error={transactionError}
                  onRefresh={() => {
                    if (checkoutBinding) {
                      void refreshTransaction(
                        returnedTransactionId,
                        checkoutBinding,
                      );
                    }
                  }}
                  onRestart={launchCheckout}
                  restarting={launching}
                />
              ) : (
                <div className="checkout-action">
                  <div>
                    <h3>Pay with Wompi Checkout</h3>
                    <p>
                      The SDK signs the order on the server. Payment details
                      stay on Wompi's hosted page.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={launchCheckout}
                    disabled={launching}
                  >
                    {launching ? "Opening checkout…" : "Open checkout"}
                  </button>
                </div>
              )}

              {!returnedTransactionId ? <SandboxCardData /> : null}

              {launchError ? (
                <InlineMessage tone="error">{launchError}</InlineMessage>
              ) : null}
            </section>

            <section
              className={`task-step${checkoutApproved ? "" : " task-step-locked"}`}
              aria-labelledby="settlement-heading"
            >
              <StepHeading
                number="2"
                title="Supplier settlement"
                id="settlement-heading"
                meta={
                  checkoutApproved
                    ? formatCents(SETTLEMENT_AMOUNT_IN_CENTS)
                    : "After approval"
                }
              />

              {checkoutApproved && transaction && checkoutBinding ? (
                <SettlementWorkspace
                  transaction={transaction}
                  orderProof={checkoutBinding.orderProof}
                />
              ) : (
                <div className="locked-copy">
                  <span className="lock-mark" aria-hidden="true">
                    2
                  </span>
                  <p>Approve the checkout to unlock supplier settlement.</p>
                </div>
              )}
            </section>
          </div>

          <OrderSummary transaction={transaction} />
        </div>
      </main>
    </>
  );
}

function StepHeading({
  number,
  title,
  id,
  meta,
}: {
  number: string;
  title: string;
  id: string;
  meta: string;
}) {
  return (
    <div className="step-heading">
      <div>
        <span className="step-number" aria-hidden="true">
          {number}
        </span>
        <h2 id={id}>{title}</h2>
      </div>
      <span className="step-meta">{meta}</span>
    </div>
  );
}

function FlowProgress({
  checkoutStatus,
  settlementAvailable,
}: {
  checkoutStatus: string | null;
  settlementAvailable: boolean;
}) {
  const checkoutComplete = checkoutStatus === "APPROVED";

  return (
    <ol className="flow-progress" aria-label="Order progress">
      <li className="is-complete">
        <span>Order</span>
        <small>Ready</small>
      </li>
      <li
        className={checkoutComplete ? "is-complete" : "is-current"}
        aria-current={checkoutComplete ? undefined : "step"}
      >
        <span>Checkout</span>
        <small>{checkoutStatus ?? "Next"}</small>
      </li>
      <li
        className={settlementAvailable ? "is-current" : ""}
        aria-current={settlementAvailable ? "step" : undefined}
      >
        <span>Settlement</span>
        <small>{settlementAvailable ? "Ready" : "Locked"}</small>
      </li>
    </ol>
  );
}

function SandboxCardData() {
  return (
    <div className="sandbox-data" aria-label="Approved sandbox card">
      <div>
        <span>Approved test card</span>
        <code>4242 4242 4242 4242</code>
      </div>
      <p>Any future expiry · Any 3-digit CVC</p>
    </div>
  );
}

function CheckoutResult({
  transactionId,
  transaction,
  loading,
  error,
  onRefresh,
  onRestart,
  restarting,
}: {
  transactionId: string;
  transaction: CheckoutTransactionDto | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onRestart: () => void;
  restarting: boolean;
}) {
  if (loading && !transaction) {
    return (
      <p className="loading-state" role="status">
        Checking the Wompi transaction…
      </p>
    );
  }

  return (
    <div className="result-stack" aria-live="polite">
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      {transaction ? (
        <div className="result-panel">
          <div className="result-title-row">
            <div>
              <p className="result-kicker">Payment result</p>
              <h3>
                {transaction.status === "APPROVED"
                  ? "Customer payment approved"
                  : `Payment ${transaction.status.toLowerCase()}`}
              </h3>
            </div>
            <StatusBadge status={transaction.status} />
          </div>

          <dl className="result-facts">
            <div>
              <dt>Amount</dt>
              <dd>{formatCents(transaction.amountInCents)}</dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{transaction.paymentMethodType ?? "Not reported"}</dd>
            </div>
          </dl>

          {transaction.statusMessage ? (
            <p className="supporting-copy">{transaction.statusMessage}</p>
          ) : null}

          <div className="result-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh status"}
            </button>
            {transaction.status !== "APPROVED" ? (
              <button type="button" onClick={onRestart} disabled={restarting}>
                {restarting ? "Opening…" : "Try another checkout"}
              </button>
            ) : null}
          </div>

          <TechnicalDetails
            rows={[
              ["Transaction ID", transaction.id],
              ["Reference", transaction.reference],
              ["Created", formatDate(transaction.createdAt) ?? "Not reported"],
            ]}
          />
        </div>
      ) : (
        <div className="result-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Try status again"}
          </button>
          <button type="button" onClick={onRestart} disabled={restarting}>
            {restarting ? "Opening…" : "Start another checkout"}
          </button>
        </div>
      )}

      {!transaction && !error ? (
        <p className="supporting-copy">Transaction {transactionId}</p>
      ) : null}
    </div>
  );
}

function SettlementWorkspace({
  transaction,
  orderProof,
}: {
  transaction: CheckoutTransactionDto;
  orderProof: string;
}) {
  const [rail, setRail] = useState<SettlementRail>("breb");
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [accountId, setAccountId] = useState("");
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [banks, setBanks] = useState<BankDto[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksError, setBanksError] = useState<string | null>(null);
  const [key, setKey] = useState(BREB_TEST_KEY);
  const [resolution, setResolution] = useState<KeyResolutionDto | null>(null);
  const [brebRecipientConfirmed, setBrebRecipientConfirmed] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [bankId, setBankId] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("AHORROS");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankReview, setBankReview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createWarning, setCreateWarning] = useState<string | null>(null);
  const [payoutResult, setPayoutResult] = useState<PayoutResult | null>(null);
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatusDto | null>(
    null,
  );
  const [statusError, setStatusError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const resolveRequestId = useRef(0);
  const statusRequestId = useRef(0);
  const bankReviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const storageKey = `wompi-sdk-demo:settlement:${transaction.id}`;
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const sourceAccountBlocked = Boolean(
    selectedAccount?.balanceInCents != null &&
      selectedAccount.balanceInCents < SETTLEMENT_AMOUNT_IN_CENTS,
  );
  const selectedBank = banks.find((bank) => bank.id === bankId);
  const resolutionConfirmed = Boolean(
    resolution?.holderName.trim() &&
      (resolution.financialEntityName?.trim() ||
        resolution.financialEntityCode?.trim()) &&
      (resolution.keyValue.trim() || key.trim()),
  );

  async function loadSourceAccounts() {
    setAccountsLoading(true);
    setAccountsError(null);

    try {
      const result = await listAccounts();

      if (result.error) {
        setAccounts([]);
        setAccountId("");
        setAccountsError(getErrorMessage(result.error));
      } else if (result.data?.length) {
        setAccounts(result.data);
        const fundedAccount = result.data.find(
          (account) =>
            account.balanceInCents == null ||
            account.balanceInCents >= SETTLEMENT_AMOUNT_IN_CENTS,
        );
        setAccountId(fundedAccount?.id ?? "");
      } else {
        setAccounts([]);
        setAccountId("");
        setAccountsError("No active payout account is available.");
      }
    } catch (error) {
      setAccounts([]);
      setAccountId("");
      setAccountsError(getErrorMessage(error));
    } finally {
      setAccountsLoading(false);
    }
  }

  async function loadDestinationBanks() {
    if (banksLoading || banks.length > 0) return;

    setBanksLoading(true);
    setBanksError(null);

    try {
      const result = await listBanks();

      if (result.error) {
        setBanks([]);
        setBanksError(getErrorMessage(result.error));
      } else if (result.data?.length) {
        setBanks(result.data);
      } else {
        setBanksError("Wompi did not return any destination banks.");
      }
    } catch (error) {
      setBanks([]);
      setBanksError(getErrorMessage(error));
    } finally {
      setBanksLoading(false);
    }
  }

  useEffect(() => {
    void loadSourceAccounts();

    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (!stored) return;

      const result = JSON.parse(stored) as PayoutResult;
      if (
        result?.payoutId &&
        (result.rail === "breb" || result.rail === "bank")
      ) {
        setPayoutResult(result);
        void refreshPayoutStatus(result.payoutId, result.rail);
      }
    } catch {
      window.sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (bankReview) bankReviewHeadingRef.current?.focus();
  }, [bankReview]);

  function selectRail(nextRail: SettlementRail) {
    setRail(nextRail);
    setCreateError(null);
    setCreateWarning(null);
    setBankReview(false);

    if (nextRail === "bank") {
      void loadDestinationBanks();
    }
  }

  async function handleResolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedKey = key.trim();
    const requestId = ++resolveRequestId.current;
    setResolving(true);
    setResolveError(null);
    setResolution(null);
    setBrebRecipientConfirmed(false);

    try {
      const result = await resolveKey({ data: { key: requestedKey } });

      if (requestId !== resolveRequestId.current) return;

      if (result.error) {
        setResolveError(getErrorMessage(result.error));
      } else if (result.data) {
        setResolution(result.data);
      } else {
        setResolveError("Wompi did not return a key resolution.");
      }
    } catch (error) {
      if (requestId === resolveRequestId.current) {
        setResolveError(getErrorMessage(error));
      }
    } finally {
      if (requestId === resolveRequestId.current) {
        setResolving(false);
      }
    }
  }

  async function submitSettlement(
    destination:
      | { rail: "breb"; key: string }
      | {
          rail: "bank";
          bankId: string;
          accountType: AccountType;
          accountNumber: string;
        },
  ) {
    setCreating(true);
    setCreateError(null);
    setCreateWarning(null);
    setStatusError(null);

    try {
      const result = await createDispersion({
        data: {
          accountId,
          checkoutTransactionId: transaction.id,
          checkoutReference: transaction.reference,
          orderProof,
          destination,
        },
      });

      if (result.error) {
        setCreateError(getErrorMessage(result.error));
      } else if (result.data?.payoutId) {
        const nextResult: PayoutResult = {
          ...result.data,
          payoutId: result.data.payoutId,
          rail: destination.rail,
        };
        setPayoutResult(nextResult);
        window.sessionStorage.setItem(storageKey, JSON.stringify(nextResult));

        if ((result.data.failed ?? 0) > 0) {
          setCreateWarning(
            "Wompi accepted the batch, but at least one transfer failed.",
          );
        }

        void refreshPayoutStatus(nextResult.payoutId, nextResult.rail);
      } else {
        setCreateError("Wompi did not return a payout ID.");
      }
    } catch (error) {
      setCreateError(getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  async function handleBrebSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !resolutionConfirmed ||
      !brebRecipientConfirmed ||
      !accountId ||
      sourceAccountBlocked
    ) {
      return;
    }
    await submitSettlement({ rail: "breb", key: key.trim() });
  }

  async function handleBankSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId || sourceAccountBlocked) return;

    if (!bankReview) {
      setBankReview(true);
      return;
    }

    await submitSettlement({
      rail: "bank",
      bankId,
      accountType,
      accountNumber,
    });
  }

  async function refreshPayoutStatus(payoutId: string, payoutRail: PayoutRail) {
    const requestId = ++statusRequestId.current;
    setRefreshing(true);
    setPayoutStatus(null);
    setStatusError(null);

    try {
      const result = await getPayoutStatus({
        data: { payoutId, rail: payoutRail },
      });

      if (requestId !== statusRequestId.current) return;

      if (result.error) {
        setStatusError(getErrorMessage(result.error));
      } else if (result.data) {
        setPayoutStatus(result.data);
      } else {
        setStatusError("Wompi did not return a payout status.");
      }
    } catch (error) {
      if (requestId === statusRequestId.current) {
        setStatusError(getErrorMessage(error));
      }
    } finally {
      if (requestId === statusRequestId.current) {
        setRefreshing(false);
      }
    }
  }

  if (payoutResult) {
    return (
      <PayoutResultPanel
        result={payoutResult}
        status={payoutStatus}
        warning={createWarning}
        error={statusError}
        refreshing={refreshing}
        onRefresh={() =>
          refreshPayoutStatus(payoutResult.payoutId, payoutResult.rail)
        }
      />
    );
  }

  return (
    <div className="settlement-workspace">
      <div className="supplier-strip">
        <div>
          <span>Supplier</span>
          <strong>{SUPPLIER_NAME}</strong>
        </div>
        <div>
          <span>Email</span>
          <strong>{SUPPLIER_EMAIL}</strong>
        </div>
        <div>
          <span>Share</span>
          <strong>{formatCents(SETTLEMENT_AMOUNT_IN_CENTS)}</strong>
        </div>
      </div>

      <fieldset className="rail-picker">
        <legend>Send to</legend>
        <label className={rail === "breb" ? "is-selected" : ""}>
          <input
            type="radio"
            name="rail"
            value="breb"
            checked={rail === "breb"}
            onChange={() => selectRail("breb")}
          />
          <span>
            <strong>BRE-B key</strong>
            <small>Recommended</small>
          </span>
        </label>
        <label className={rail === "bank" ? "is-selected" : ""}>
          <input
            type="radio"
            name="rail"
            value="bank"
            checked={rail === "bank"}
            onChange={() => selectRail("bank")}
          />
          <span>
            <strong>Bank or wallet</strong>
            <small>Account details</small>
          </span>
        </label>
      </fieldset>

      {rail === "breb" ? (
        <div className="rail-form">
          <form className="resolve-row" onSubmit={handleResolve}>
            <label>
              BRE-B key
              <input
                name="key"
                value={key}
                onChange={(event) => {
                  resolveRequestId.current += 1;
                  setKey(event.currentTarget.value);
                  setResolving(false);
                  setResolution(null);
                  setResolveError(null);
                  setBrebRecipientConfirmed(false);
                }}
                autoComplete="off"
                required
              />
            </label>
            <button type="submit" disabled={resolving || !key.trim()}>
              {resolving ? "Resolving…" : "Resolve key"}
            </button>
          </form>

          <p className="field-note">
            Sandbox example: <code>@elias123</code>
          </p>

          {resolveError ? (
            <InlineMessage tone="error">{resolveError}</InlineMessage>
          ) : null}

          {resolution ? (
            <form
              className="confirm-settlement"
              onSubmit={handleBrebSettlement}
            >
              <ResolutionPreview
                resolution={resolution}
                fallbackKey={key}
                confirmed={resolutionConfirmed}
              />
              <SourceAccountField
                accounts={accounts}
                accountId={accountId}
                loading={accountsLoading}
                error={accountsError}
                onChange={setAccountId}
                onRetry={loadSourceAccounts}
              />
              {!resolutionConfirmed ? (
                <InlineMessage tone="error">
                  Wompi did not return enough recipient details to confirm this
                  key.
                </InlineMessage>
              ) : null}
              {resolutionConfirmed ? (
                <label className="confirmation-check">
                  <input
                    type="checkbox"
                    checked={brebRecipientConfirmed}
                    onChange={(event) =>
                      setBrebRecipientConfirmed(event.currentTarget.checked)
                    }
                  />
                  <span>I confirm this is {SUPPLIER_NAME}'s payout key.</span>
                </label>
              ) : null}
              <button
                type="submit"
                disabled={
                  creating ||
                  accountsLoading ||
                  !accountId ||
                  sourceAccountBlocked ||
                  !resolutionConfirmed ||
                  !brebRecipientConfirmed
                }
              >
                {creating ? "Sending…" : "Send COP 40,000"}
              </button>
            </form>
          ) : null}
        </div>
      ) : (
        <form
          className="bank-form"
          onSubmit={handleBankSettlement}
          aria-busy={creating || banksLoading}
        >
          {bankReview && selectedBank && selectedAccount ? (
            <div className="bank-review" aria-live="polite">
              <div>
                <p className="result-kicker">Review payout</p>
                <h3 ref={bankReviewHeadingRef} tabIndex={-1}>
                  Confirm supplier destination
                </h3>
              </div>
              <dl className="review-facts">
                <div>
                  <dt>From</dt>
                  <dd>{accountLabel(selectedAccount)}</dd>
                </div>
                <div>
                  <dt>Available</dt>
                  <dd>{formatCents(selectedAccount.balanceInCents)}</dd>
                </div>
                <div>
                  <dt>Recipient</dt>
                  <dd>{SUPPLIER_NAME}</dd>
                </div>
                <div>
                  <dt>Destination</dt>
                  <dd>
                    {selectedBank.name ?? selectedBank.code ?? "Destination"} ·
                    •••• {accountNumber.slice(-4)}
                  </dd>
                </div>
                <div>
                  <dt>Destination type</dt>
                  <dd>{accountTypeLabel(accountType)}</dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>{formatCents(SETTLEMENT_AMOUNT_IN_CENTS)}</dd>
                </div>
                <div>
                  <dt>Balance after payout</dt>
                  <dd>
                    {selectedAccount.balanceInCents == null
                      ? "Not reported"
                      : formatCents(
                          selectedAccount.balanceInCents -
                            SETTLEMENT_AMOUNT_IN_CENTS,
                        )}
                  </dd>
                </div>
              </dl>
              <div className="result-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setBankReview(false)}
                  disabled={creating}
                >
                  Edit details
                </button>
                <button type="submit" disabled={creating}>
                  {creating ? "Sending…" : "Send COP 40,000"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <SourceAccountField
                accounts={accounts}
                accountId={accountId}
                loading={accountsLoading}
                error={accountsError}
                onChange={(value) => {
                  setAccountId(value);
                  setBankReview(false);
                }}
                onRetry={loadSourceAccounts}
              />

              <div
                className="supplier-profile"
                aria-label="Saved supplier profile"
              >
                <div>
                  <span>Saved account holder</span>
                  <strong>{SUPPLIER_NAME}</strong>
                </div>
                <div>
                  <span>Legal identity</span>
                  <strong>
                    {SUPPLIER_PERSON_TYPE === "NATURAL" ? "Person" : "Business"}
                    {" · "}
                    {SUPPLIER_LEGAL_ID_TYPE} •••• {SUPPLIER_LEGAL_ID.slice(-4)}
                  </strong>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  Bank or digital wallet
                  <select
                    name="bankId"
                    value={bankId}
                    onChange={(event) => {
                      const nextBankId = event.currentTarget.value;
                      const nextBank = banks.find(
                        (bank) => bank.id === nextBankId,
                      );
                      setBankId(nextBankId);
                      setAccountNumber("");
                      setAccountType(
                        nextBank?.isElectronicDeposit
                          ? "DEPOSITO_ELECTRONICO"
                          : "AHORROS",
                      );
                      setBankReview(false);
                    }}
                    disabled={banksLoading || banks.length === 0}
                    aria-busy={banksLoading}
                    required
                  >
                    <option value="">
                      {banksLoading
                        ? "Loading destinations…"
                        : "Select destination"}
                    </option>
                    {banks.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.name ?? bank.code ?? "Unnamed destination"}
                        {bank.isElectronicDeposit ? " · Digital wallet" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedBank?.isElectronicDeposit ? (
                  <div className="read-only-field">
                    <span>Destination type</span>
                    <strong>Digital deposit</strong>
                  </div>
                ) : (
                  <label>
                    Account type
                    <select
                      name="accountType"
                      value={accountType}
                      onChange={(event) => {
                        setAccountType(
                          event.currentTarget.value as AccountType,
                        );
                        setBankReview(false);
                      }}
                      required
                    >
                      <option value="AHORROS">Savings</option>
                      <option value="CORRIENTE">Checking</option>
                    </select>
                  </label>
                )}

                <label>
                  {selectedBank?.isElectronicDeposit
                    ? "Wallet number"
                    : "Account number"}
                  <input
                    name="accountNumber"
                    value={accountNumber}
                    onChange={(event) => {
                      setAccountNumber(event.currentTarget.value);
                      setBankReview(false);
                    }}
                    inputMode="numeric"
                    pattern="[0-9]*[1-9][0-9]*"
                    minLength={6}
                    maxLength={20}
                    autoComplete="off"
                    required
                  />
                </label>
              </div>

              {banksError ? (
                <InlineMessage tone="error">
                  {banksError}{" "}
                  <button
                    className="inline-button"
                    type="button"
                    onClick={loadDestinationBanks}
                  >
                    Try again
                  </button>
                </InlineMessage>
              ) : null}

              <button
                type="submit"
                disabled={
                  accountsLoading ||
                  banksLoading ||
                  !accountId ||
                  sourceAccountBlocked ||
                  !bankId ||
                  !accountNumber
                }
              >
                Review payout
              </button>
            </>
          )}
        </form>
      )}

      {createError ? (
        <InlineMessage tone="error">{createError}</InlineMessage>
      ) : null}
    </div>
  );
}

function ResolutionPreview({
  resolution,
  fallbackKey,
  confirmed,
}: {
  resolution: KeyResolutionDto;
  fallbackKey: string;
  confirmed: boolean;
}) {
  return (
    <div
      className={`resolution-preview${confirmed ? "" : " is-unconfirmed"}`}
      aria-live="polite"
    >
      <div className="resolution-mark" aria-hidden="true">
        {confirmed ? "✓" : "?"}
      </div>
      <div>
        <p>{confirmed ? "Key found" : "Recipient details incomplete"}</p>
        <strong>{resolution.holderName || "Masked holder unavailable"}</strong>
        <span>
          {resolution.financialEntityName || "Unknown institution"}
          {resolution.financialEntityCode
            ? ` · ${resolution.financialEntityCode}`
            : ""}
        </span>
        <code>{resolution.keyValue || fallbackKey}</code>
      </div>
    </div>
  );
}

function SourceAccountField({
  accounts,
  accountId,
  loading,
  error,
  onChange,
  onRetry,
}: {
  accounts: AccountDto[];
  accountId: string;
  loading: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <InlineMessage tone="error">
        {error}{" "}
        <button className="inline-button" type="button" onClick={onRetry}>
          Try again
        </button>
      </InlineMessage>
    );
  }

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const insufficient = Boolean(
    selectedAccount?.balanceInCents != null &&
      selectedAccount.balanceInCents < SETTLEMENT_AMOUNT_IN_CENTS,
  );

  return (
    <div className="source-account-group" aria-busy={loading}>
      <label className="source-account-field">
        Source account
        <select
          value={accountId}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={loading || accounts.length === 0}
          required
        >
          <option value="">
            {loading ? "Loading source account…" : "Select source account"}
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {accountLabel(account)} · {formatCents(account.balanceInCents)}
            </option>
          ))}
        </select>
      </label>
      {insufficient ? (
        <InlineMessage tone="error">
          This account has {formatCents(selectedAccount?.balanceInCents)};{" "}
          {formatCents(SETTLEMENT_AMOUNT_IN_CENTS)} is required.
        </InlineMessage>
      ) : null}
      {accountId && selectedAccount?.balanceInCents == null ? (
        <InlineMessage tone="warning">
          Wompi did not report this account balance. The payout can still be
          sent.
        </InlineMessage>
      ) : null}
    </div>
  );
}

function accountLabel(account: AccountDto) {
  const number = account.number;
  const maskedNumber = number
    ? `•••• ${number.slice(-4)}`
    : account.id === "WOMPI_ACCOUNT"
      ? "Sandbox source"
      : "Payout account";
  const institution = account.bankName ?? "Wompi";

  return `${institution} ${maskedNumber}`;
}

function accountTypeLabel(accountType: AccountType) {
  if (accountType === "DEPOSITO_ELECTRONICO") return "Digital deposit";
  return accountType === "CORRIENTE" ? "Checking" : "Savings";
}

function PayoutResultPanel({
  result,
  status,
  warning,
  error,
  refreshing,
  onRefresh,
}: {
  result: PayoutResult;
  status: PayoutStatusDto | null;
  warning: string | null;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const presentation = getPayoutPresentation(result, status);

  return (
    <div className="result-stack" aria-live="polite">
      <div className="result-panel">
        <div className="result-title-row">
          <div>
            <p className="result-kicker">Supplier settlement</p>
            <h3>{presentation.title}</h3>
          </div>
          <StatusBadge status={presentation.visibleStatus} />
        </div>

        <dl className="result-facts">
          <div>
            <dt>Amount</dt>
            <dd>{formatCents(SETTLEMENT_AMOUNT_IN_CENTS)}</dd>
          </div>
          <div>
            <dt>Rail</dt>
            <dd>{result.rail === "breb" ? "BRE-B" : "Bank or wallet"}</dd>
          </div>
        </dl>

        {warning ? (
          <InlineMessage tone="warning">{warning}</InlineMessage>
        ) : null}
        {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
        {status?.transactionFailureReason ? (
          <InlineMessage tone="error">
            {status.transactionFailureReason}
          </InlineMessage>
        ) : null}
        {status?.transactionLookupError ? (
          <InlineMessage tone="warning">
            Transfer details are not available yet.{" "}
            {status.transactionLookupError}
          </InlineMessage>
        ) : null}

        <div className="result-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh status"}
          </button>
          <a className="button-link" href="/">
            Start a new order
          </a>
        </div>

        <TechnicalDetails
          rows={[
            ["Payout ID", result.payoutId],
            ["Batch status", status?.status ?? "Submitted"],
            ["Transfer status", status?.transactionStatus ?? "Pending lookup"],
            ["Reference", status?.reference ?? "Available after refresh"],
            [
              "Created",
              formatDate(status?.createdAt) ?? "Available after refresh",
            ],
          ]}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${statusTone(status)}`}>
      {status}
    </span>
  );
}

function TechnicalDetails({ rows }: { rows: Array<[string, string]> }) {
  return (
    <details className="technical-details">
      <summary>Technical details</summary>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function InlineMessage({
  tone,
  children,
}: {
  tone: "error" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div className={`inline-message message-${tone}`} role="alert">
      {children}
    </div>
  );
}

function OrderSummary({
  transaction,
}: {
  transaction: CheckoutTransactionDto | null;
}) {
  return (
    <aside className="order-summary" aria-labelledby="order-heading">
      <div className="order-summary-heading">
        <div>
          <p className="eyebrow">Order CO-1042</p>
          <h2 id="order-heading">{ORDER_NAME}</h2>
        </div>
        <span className="quantity">× 1</span>
      </div>

      <div className="product-art" aria-hidden="true">
        <span className="package-body" />
        <span className="package-tape" />
        <span className="package-label" />
      </div>

      <dl className="order-lines">
        <div>
          <dt>Customer pays</dt>
          <dd>{formatCents(ORDER_AMOUNT_IN_CENTS)}</dd>
        </div>
        <div>
          <dt>Supplier share</dt>
          <dd>{formatCents(SETTLEMENT_AMOUNT_IN_CENTS)}</dd>
        </div>
        <div className="order-total">
          <dt>Store remainder</dt>
          <dd>
            {formatCents(ORDER_AMOUNT_IN_CENTS - SETTLEMENT_AMOUNT_IN_CENTS)}
          </dd>
        </div>
      </dl>

      <div className="party-list">
        <div>
          <span>Customer</span>
          <strong>{CUSTOMER_NAME}</strong>
          <small>{CUSTOMER_EMAIL}</small>
        </div>
        <div>
          <span>Supplier</span>
          <strong>{SUPPLIER_NAME}</strong>
          <small>{SUPPLIER_EMAIL}</small>
        </div>
      </div>

      {transaction ? (
        <div className="order-state">
          <StatusBadge status={transaction.status} />
          <span>Checkout returned</span>
        </div>
      ) : null}

      <p className="sandbox-note">
        Sandbox only. Checkout and Payouts use separate Wompi balances.
      </p>
    </aside>
  );
}
