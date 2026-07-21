import { z } from "zod";

/** Maximum amount Wompi accepts, in cents (spec: `amount_in_cents` `maximum: 1E12`). */
const MAX_AMOUNT_IN_CENTS = 1_000_000_000_000;

export const CurrencySchema = z.literal("COP");

export const PaymentMethodTypeSchema = z.enum([
  "CARD",
  "NEQUI",
  "PSE",
  "BANCOLOMBIA",
  "BANCOLOMBIA_TRANSFER",
  "BANCOLOMBIA_COLLECT",
  "BANCOLOMBIA_QR",
  "BANCOLOMBIA_BNPL",
  "DAVIPLATA",
  "SU_PLUS",
  "CARD_POS",
]);

export const TransactionStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "DECLINED",
  "ERROR",
  "VOIDED",
]);

export const PaymentSourceTypeSchema = z.enum(["CARD", "NEQUI"]);

export const PaymentSourceStatusSchema = z.enum(["AVAILABLE", "PENDING"]);

export const NequiTokenStatusSchema = z.enum(["PENDING", "APPROVED", "DECLINED"]);

export const LegalIdTypeSchema = z.enum(["CC", "NIT", "PP", "CE", "TI", "DNI", "RG", "OTHER"]);

export const TaxTypeSchema = z.enum(["VAT", "CONSUMPTION"]);

export const OrderDirectionSchema = z.enum(["DESC", "ASC"]);

export const AcceptanceTypeSchema = z.literal("END_USER_POLICY");

export const MerchantLegalIdTypeSchema = z.enum(["NIT", "CC"]);

export const CustomerDataSchema = z.object({
  phone_number: z.string().optional(),
  full_name: z.string(),
  legal_id: z.string().optional(),
  legal_id_type: LegalIdTypeSchema.optional(),
});

export const ShippingAddressSchema = z.object({
  address_line_1: z.string(),
  address_line_2: z.string().optional(),
  country: z.string(),
  region: z.string(),
  city: z.string(),
  name: z.string().optional(),
  phone_number: z.string(),
  postal_code: z.string().optional(),
});

/**
 * Lenient by design: the direct flow sends `{ type, token, installments… }`,
 * while charges against a saved `payment_source_id` send only
 * `{ installments }` — Wompi infers the type from the source.
 */
export const TransactionPaymentMethodSchema = z
  .object({
    type: z.string().optional(),
    installments: z.number().int().min(1).optional(),
  })
  .loose();

export const CreateTransactionInputSchema = z
  .object({
    acceptance_token: z.string(),
    amount_in_cents: z.number().int().min(1).max(MAX_AMOUNT_IN_CENTS),
    currency: CurrencySchema,
    signature: z.string(),
    customer_email: z.email(),
    payment_method: TransactionPaymentMethodSchema.optional(),
    payment_source_id: z.number().int().positive().optional(),
    redirect_url: z.url().optional(),
    reference: z.string(),
    expiration_time: z.string().optional(),
    customer_data: CustomerDataSchema.optional(),
    shipping_address: ShippingAddressSchema.optional(),
  })
  .refine((data) => data.payment_method !== undefined || data.payment_source_id !== undefined, {
    message: "Provide payment_method, payment_source_id, or both",
  });

/**
 * Response shape of a transaction.
 *
 * Wompi's spec marks no response field as required, so every non-identity field is
 * optional/nullish and unknown fields pass through — a successful API call must never
 * be reported as a validation error. Only `id`, `status` and `reference` are kept
 * required, as the stable identifiers consumers rely on.
 */
export const TransactionSchema = z
  .object({
    id: z.string(),
    status: TransactionStatusSchema,
    reference: z.string(),
    created_at: z.string().optional(),
    amount_in_cents: z.number().int().optional(),
    customer_email: z.string().optional(),
    currency: CurrencySchema.optional(),
    payment_method_type: z.string().optional(),
    payment_method: TransactionPaymentMethodSchema.optional(),
    status_message: z.string().nullish(),
    shipping_address: ShippingAddressSchema.nullish(),
    redirect_url: z.string().nullish(),
    payment_link_id: z.string().nullish(),
  })
  .loose();

export const TransactionListParamsSchema = z.object({
  reference: z.string().optional(),
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
    .optional(),
  until_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
    .optional(),
  page: z.number().int().min(1).max(1_000_000).optional(),
  page_size: z.number().int().min(1).max(200).optional(),
  id: z.string().optional(),
  payment_method_type: PaymentMethodTypeSchema.optional(),
  status: TransactionStatusSchema.optional(),
  customer_email: z.email().optional(),
  order_by: z.string().optional(),
  order: OrderDirectionSchema.optional(),
});

export const VoidTransactionInputSchema = z.object({
  amount_in_cents: z.number().int().min(1).max(MAX_AMOUNT_IN_CENTS).optional(),
});

/**
 * Response payload of `POST /transactions/{id}/void`.
 *
 * Wompi's spec documents an empty `201`, but the API actually answers with a
 * body wrapping the void outcome: a top-level `status` plus the voided
 * transaction nested under `transaction`. Lenient, like every response schema.
 */
export const VoidTransactionResultSchema = z
  .object({
    status: z.string().optional(),
    status_message: z.string().nullish(),
    transaction: TransactionSchema.optional(),
  })
  .loose();

export const TokenizeCardInputSchema = z.object({
  number: z.string(),
  cvc: z.string(),
  exp_month: z.string(),
  exp_year: z.string(),
  card_holder: z.string(),
});

export const TokenizeNequiInputSchema = z.object({
  phone_number: z.string(),
});

export const CardTokenSchema = z
  .object({
    id: z.string(),
    created_at: z.string().optional(),
    brand: z.string().optional(),
    name: z.string().optional(),
    last_four: z.string().optional(),
    bin: z.string().optional(),
    exp_year: z.string().optional(),
    exp_month: z.string().optional(),
    card_holder: z.string().optional(),
    expires_at: z.string().optional(),
  })
  .loose();

export const NequiTokenSchema = z
  .object({
    id: z.string(),
    status: NequiTokenStatusSchema,
    phone_number: z.string().optional(),
    name: z.string().optional(),
  })
  .loose();

export const PaymentSourcePublicDataSchema = z.object({
  type: PaymentSourceTypeSchema,
  phone_number: z.string().optional(),
});

export const PaymentSourceSchema = z
  .object({
    id: z.number().int(),
    status: PaymentSourceStatusSchema,
    type: PaymentSourceTypeSchema.optional(),
    token: z.string().optional(),
    customer_email: z.string().optional(),
    public_data: PaymentSourcePublicDataSchema.optional(),
  })
  .loose();

export const CreatePaymentSourceInputSchema = z.object({
  type: PaymentSourceTypeSchema,
  token: z.string(),
  acceptance_token: z.string(),
  customer_email: z.email(),
});

export const CustomerReferenceSchema = z.object({
  label: z.string().max(24),
  is_required: z.boolean(),
});

export const PaymentLinkCustomerDataSchema = z.object({
  customer_references: z.array(CustomerReferenceSchema).max(2).optional(),
});

export const TaxByAmountSchema = z.object({
  type: TaxTypeSchema,
  amount_in_cents: z.number().int().min(1).max(MAX_AMOUNT_IN_CENTS),
});

export const TaxByPercentageSchema = z.object({
  type: TaxTypeSchema,
  percentage: z.number().int().min(1).max(50),
});

export const TaxSchema = z.union([TaxByAmountSchema, TaxByPercentageSchema]);

export const CreatePaymentLinkInputSchema = z.object({
  name: z.string(),
  description: z.string(),
  single_use: z.boolean(),
  collect_shipping: z.boolean(),
  collect_customer_legal_id: z.boolean().optional(),
  amount_in_cents: z.number().int().min(1).max(MAX_AMOUNT_IN_CENTS).optional(),
  currency: CurrencySchema.optional(),
  signature: z.string().optional(),
  reference: z.string().optional(),
  expiration_time: z.string().optional(),
  sku: z.string().max(36).optional(),
  expires_at: z.string().optional(),
  redirect_url: z.string().optional(),
  image_url: z.string().optional(),
  customer_data: PaymentLinkCustomerDataSchema.optional(),
  taxes: z.array(TaxSchema).optional(),
});

/**
 * Response shape of a payment link.
 *
 * Wompi returns `null` (not absent) for every optional field the merchant did not set,
 * so all such fields are `.nullish()` — a successful API call must never be reported as
 * a validation error. `checkout_url` is injected by the SDK after parsing, so callers
 * don't have to build `https://checkout.wompi.co/l/{id}` themselves.
 */
export const PaymentLinkSchema = z
  .object({
    id: z.string(),
    name: z.string().nullish(),
    description: z.string().nullish(),
    single_use: z.boolean().nullish(),
    collect_shipping: z.boolean().nullish(),
    collect_customer_legal_id: z.boolean().nullish(),
    amount_in_cents: z.number().int().nullish(),
    currency: CurrencySchema.nullish(),
    signature: z.string().nullish(),
    reference: z.string().nullish(),
    expiration_time: z.string().nullish(),
    sku: z.string().nullish(),
    expires_at: z.string().nullish(),
    redirect_url: z.string().nullish(),
    image_url: z.string().nullish(),
    customer_data: PaymentLinkCustomerDataSchema.nullish(),
    taxes: z.array(TaxSchema).nullish(),
    active: z.boolean().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    checkout_url: z.string().optional(),
  })
  .loose();

export const UpdatePaymentLinkInputSchema = z.object({
  active: z.boolean(),
});

export const PresignedAcceptanceSchema = z.object({
  acceptance_token: z.string(),
  permalink: z.string(),
  type: AcceptanceTypeSchema,
});

export const MerchantSchema = z
  .object({
    id: z.number().int(),
    name: z.string().optional(),
    legal_name: z.string().optional(),
    legal_id: z.string().optional(),
    legal_id_type: z.string().optional(),
    phone_number: z.string().optional(),
    active: z.boolean().optional(),
    logo_url: z.string().nullish(),
    email: z.string().optional(),
    contact_name: z.string().optional(),
    public_key: z.string().optional(),
    accepted_payment_methods: z.array(z.string()).optional(),
    accepted_currencies: z.array(CurrencySchema).optional(),
    presigned_acceptance: PresignedAcceptanceSchema.optional(),
  })
  .loose();

export const FinancialInstitutionSchema = z
  .object({
    financial_institution_code: z.string(),
    financial_institution_name: z.string().optional(),
  })
  .loose();

/**
 * Wraps a data schema in Wompi's `{ data, meta? }` envelope and immediately
 * unwraps to `data` after parsing. The wire format is preserved for validation,
 * but callers receive the payload directly — `response.X` instead of
 * `response.data.X`. The `meta` channel (only carries pagination) is dropped.
 */
export const wompiResponse = <T extends z.ZodType>(dataSchema: T) =>
  z
    .object({
      data: dataSchema,
      meta: z.record(z.string(), z.unknown()).optional(),
    })
    .transform((parsed) => (parsed as { data: z.output<T> }).data);

export const wompiListResponse = <T extends z.ZodType>(itemSchema: T) =>
  z
    .object({
      data: z.array(itemSchema),
      meta: z.record(z.string(), z.unknown()).optional(),
    })
    .transform((parsed) => (parsed as { data: z.output<T>[] }).data);

// ---------------------------------------------------------------------------
// Payouts (Pagos a Terceros) · BRE-B
//
// These endpoints live on the payouts API (`api.payouts.wompi.co/v2`), which
// uses camelCase field names on the wire — unlike the snake_case payments API.
// ---------------------------------------------------------------------------

export const BrebKeyTypeSchema = z.enum([
  "ALPHANUMERIC",
  "MAIL",
  "PHONE",
  "IDENTIFICATION",
  "ESTABLISHMENT_CODE",
]);

export const PayoutPaymentTypeSchema = z.enum(["PAYROLL", "PROVIDERS", "OTHER"]);

export const PayoutTransactionStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "APPROVED",
  "FAILED",
  "REJECTED",
  "CANCELLED",
  "READY_TO_FILE",
  "ADDED_TO_FILE",
  "UNKNOWN",
]);

export const PayoutStatusSchema = z.enum([
  "PENDING",
  "PENDING_APPROVAL",
  "NOT_APPROVED",
  "TOTAL_PAYMENT",
  "PARTIAL_PAYMENT",
  "REJECTED",
  "AFE_REJECTED",
  "AFE_ON_HOLD",
]);

export const PayoutLegalIdTypeSchema = z.enum(["CC", "CE", "NIT", "PP", "TI", "DNI"]);

export const PayoutPersonTypeSchema = z.enum(["NATURAL", "JURIDICA"]);

export const PayoutAccountTypeSchema = z.enum(["AHORROS", "CORRIENTE", "DEPOSITO_ELECTRONICO"]);

export const BrebFinancialEntitySchema = z
  .object({
    name: z.string().optional(),
    code: z.string().optional(),
  })
  .loose();

/**
 * Result of resolving a BRE-B key (`GET /breb/keys/resolve/{keyValue}`).
 * Holder data comes back partially masked by design.
 */
export const BrebKeyResolutionSchema = z
  .object({
    holderName: z.string().optional(),
    financialEntity: BrebFinancialEntitySchema.optional(),
    keyType: z.string().optional(),
    keyValue: z.string().optional(),
  })
  .loose();

export const PayoutRecurringSchema = z.object({
  interval: z.enum(["biweek", "month"]),
  months: z.literal([3, 6, 12], { error: "Must be 3, 6, or 12" }),
  description: z.string().optional(),
});

/**
 * One transaction inside a payout batch. A BRE-B transaction sends `key` in
 * place of `bankId` + `accountType` + `accountNumber`; the beneficiary document
 * (`legalIdType` + `legalId`) remains optional as a pair for BRE-B and is
 * required for a bank transaction. Both kinds can be mixed in one batch, but
 * each transaction must use exactly one destination method.
 */
export const PayoutTransactionInputSchema = z
  .object({
    amount: z.number().int().positive(),
    name: z.string().min(1),
    email: z.email(),
    key: z.string().min(1).optional(),
    bankId: z.string().min(1).optional(),
    accountType: PayoutAccountTypeSchema.optional(),
    accountNumber: z.string().min(1).optional(),
    legalIdType: PayoutLegalIdTypeSchema.optional(),
    legalId: z.string().min(1).optional(),
    phone: z.string().optional(),
    description: z.string().optional(),
    personType: PayoutPersonTypeSchema.optional(),
    reference: z
      .string()
      .max(40)
      .regex(/^[a-zA-Z0-9-]+$/, "Only letters, numbers, and hyphens")
      .optional(),
  })
  .refine(
    (t) =>
      t.key !== undefined ||
      (t.bankId !== undefined && t.accountType !== undefined && t.accountNumber !== undefined),
    { message: "Provide key (BRE-B) or bankId + accountType + accountNumber (bank transfer)" }
  )
  .refine(
    (t) =>
      t.key === undefined ||
      (t.bankId === undefined && t.accountType === undefined && t.accountNumber === undefined),
    { message: "Provide either key (BRE-B) or bank fields, not both" }
  )
  .refine((t) => (t.legalIdType === undefined) === (t.legalId === undefined), {
    message: "Provide both legalIdType and legalId, or neither",
  })
  .refine((t) => t.key !== undefined || (t.legalIdType !== undefined && t.legalId !== undefined), {
    message: "Bank transfers require the beneficiary document: legalIdType + legalId",
  });

export const CreatePayoutInputSchema = z
  .object({
    reference: z.string().min(1),
    accountId: z.string().min(1),
    paymentType: PayoutPaymentTypeSchema,
    transactions: z.array(PayoutTransactionInputSchema).min(1),
    dispersionDatetime: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Must be YYYY-MM-DDTHH:mm format")
      .optional(),
    recurring: PayoutRecurringSchema.optional(),
    /** Sandbox only: simulates the final status of every transaction in the batch. */
    transactionStatus: z.enum(["APPROVED", "FAILED"]).optional(),
  })
  .refine((payout) => payout.recurring === undefined || payout.dispersionDatetime !== undefined, {
    message: "dispersionDatetime is required for recurring payouts",
    path: ["dispersionDatetime"],
  });

/**
 * Response payload of `POST /payouts`. Lenient like every response schema:
 * only `payoutId` — the identifier consumers persist — is required.
 */
export const CreatePayoutResultSchema = z
  .object({
    payoutId: z.string(),
    transactions: z.number().int().optional(),
    success: z.number().int().optional(),
    failed: z.number().int().optional(),
  })
  .loose();

/** Beneficiary data on a payout transaction, masked and enriched with the resolved BRE-B key. */
export const PayoutPayeeSchema = z
  .object({
    bank: z.string().optional(),
    bankCode: z.string().optional(),
    key: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    keyType: z.string().optional(),
    legalId: z.string().optional(),
    personType: z.string().optional(),
    accountType: z.string().optional(),
    legalIdType: z.string().optional(),
    accountNumber: z.string().optional(),
    keyResolutionId: z.string().optional(),
    paymentMethodType: z.string().optional(),
  })
  .loose();

export const PayoutFailureReasonSchema = z
  .object({
    code: z.string().optional(),
    description: z.string().optional(),
  })
  .loose();

export const PayoutTransactionSchema = z
  .object({
    id: z.string(),
    status: PayoutTransactionStatusSchema,
    payoutId: z.string().optional(),
    amountInCents: z.number().int().optional(),
    payee: PayoutPayeeSchema.optional(),
    payeeInfo: PayoutPayeeSchema.optional(),
    failureReason: z.union([PayoutFailureReasonSchema, z.string()]).nullish(),
    reference: z.string().optional(),
    currency: z.string().optional(),
    appliedAt: z.string().nullish(),
    createdAt: z.string().optional(),
  })
  .loose();

/** Paginated payload returned by `GET /payouts/{payoutId}/transactions`. */
export const PayoutTransactionPageSchema = z
  .object({
    page: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional(),
    total: z.number().int().nonnegative().optional(),
    pages: z.number().int().nonnegative().optional(),
    records: z.array(PayoutTransactionSchema),
  })
  .loose();

export const PayoutSchema = z
  .object({
    id: z.string(),
    status: PayoutStatusSchema,
    reference: z.string().optional(),
    amountInCents: z.number().int().optional(),
    paymentType: z.string().optional(),
    totalTransactions: z.number().int().optional(),
    currency: z.string().optional(),
    approvedAt: z.string().nullish(),
    createdAt: z.string().optional(),
  })
  .loose();

export const WebhookSignatureSchema = z.object({
  properties: z.array(z.string()),
  checksum: z.string(),
});

/**
 * Envelope of every event Wompi POSTs to the configured Events URL.
 *
 * `event` stays a plain string (Wompi adds event types over time); use
 * {@link TransactionUpdatedEventSchema} or the `isTransactionUpdatedEvent`
 * guard from `/server` to narrow the payload of known types.
 */
export const WebhookEventSchema = z
  .object({
    event: z.string(),
    data: z.record(z.string(), z.unknown()),
    environment: z.string(),
    signature: WebhookSignatureSchema,
    timestamp: z.number(),
    sent_at: z.string().optional(),
  })
  .loose();

/** Generic envelope for payouts events, which use `sentAt` and omit `environment`. */
export const PayoutWebhookEventSchema = z
  .object({
    event: z.string(),
    data: z.record(z.string(), z.unknown()),
    signature: WebhookSignatureSchema,
    timestamp: z.number(),
    sentAt: z.string().optional(),
  })
  .loose();

export const TransactionUpdatedEventSchema = z
  .object({
    event: z.literal("transaction.updated"),
    data: z.object({ transaction: TransactionSchema }),
    environment: z.string(),
    signature: WebhookSignatureSchema,
    timestamp: z.number(),
    sent_at: z.string().optional(),
  })
  .loose();

export const NequiTokenUpdatedEventSchema = z
  .object({
    event: z.literal("nequi_token.updated"),
    data: z.object({ nequi_token: NequiTokenSchema }),
    environment: z.string(),
    signature: WebhookSignatureSchema,
    timestamp: z.number(),
    sent_at: z.string().optional(),
  })
  .loose();

/**
 * `transaction.updated` fired by the payouts API for a BRE-B/bank dispersal.
 * It shares its name with the payments-API event; `transaction.payoutId` —
 * required here — is what tells them apart. Uses camelCase `sentAt` and omits
 * `environment`, unlike payments-API events.
 */
export const PayoutTransactionUpdatedEventSchema = z
  .object({
    event: z.literal("transaction.updated"),
    data: z.object({ transaction: PayoutTransactionSchema.extend({ payoutId: z.string() }) }),
    signature: WebhookSignatureSchema,
    timestamp: z.number(),
    sentAt: z.string().optional(),
  })
  .loose();

/** `payout.updated` fired by the payouts API when a whole batch changes status. */
export const PayoutUpdatedEventSchema = z
  .object({
    event: z.literal("payout.updated"),
    data: z.object({ payout: PayoutSchema }),
    signature: WebhookSignatureSchema,
    timestamp: z.number(),
    sentAt: z.string().optional(),
  })
  .loose();

export const NotFoundErrorResponseSchema = z.object({
  error: z.object({
    type: z.literal("NOT_FOUND_ERROR"),
    reason: z.string(),
  }),
});

export const InputValidationErrorResponseSchema = z.object({
  error: z.object({
    type: z.literal("INPUT_VALIDATION_ERROR"),
    messages: z.record(z.string(), z.array(z.string())),
  }),
});

/**
 * Credentials for the payouts API (Pagos a Terceros / BRE-B). These are
 * separate from the payments keys and come from the "Pagos a Terceros"
 * section of the Wompi dashboard.
 */
export const PayoutsCredentialsSchema = z.object({
  apiKey: z.string().min(1, "A payouts API key is required"),
  userPrincipalId: z.string().min(1, "A payouts user principal id is required"),
});

export const WompiClientOptionsSchema = z.object({
  publicKey: z.string().min(1, "A public key is required"),
  privateKey: z.string().optional(),
  payouts: PayoutsCredentialsSchema.optional(),
  sandbox: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Currency = z.output<typeof CurrencySchema>;
export type PaymentMethodType = z.output<typeof PaymentMethodTypeSchema>;
export type TransactionStatus = z.output<typeof TransactionStatusSchema>;
export type PaymentSourceType = z.output<typeof PaymentSourceTypeSchema>;
export type PaymentSourceStatus = z.output<typeof PaymentSourceStatusSchema>;
export type NequiTokenStatus = z.output<typeof NequiTokenStatusSchema>;
export type LegalIdType = z.output<typeof LegalIdTypeSchema>;
export type TaxType = z.output<typeof TaxTypeSchema>;
export type OrderDirection = z.output<typeof OrderDirectionSchema>;
export type AcceptanceType = z.output<typeof AcceptanceTypeSchema>;
export type MerchantLegalIdType = z.output<typeof MerchantLegalIdTypeSchema>;

export type CustomerData = z.output<typeof CustomerDataSchema>;
export type ShippingAddress = z.output<typeof ShippingAddressSchema>;
export type TransactionPaymentMethod = z.output<typeof TransactionPaymentMethodSchema>;

export type CreateTransactionInput = z.output<typeof CreateTransactionInputSchema>;
export type Transaction = z.output<typeof TransactionSchema>;
export type TransactionListParams = z.output<typeof TransactionListParamsSchema>;
export type VoidTransactionInput = z.output<typeof VoidTransactionInputSchema>;
export type VoidTransactionResult = z.output<typeof VoidTransactionResultSchema>;

export type TokenizeCardInput = z.output<typeof TokenizeCardInputSchema>;
export type TokenizeNequiInput = z.output<typeof TokenizeNequiInputSchema>;
export type CardToken = z.output<typeof CardTokenSchema>;
export type NequiToken = z.output<typeof NequiTokenSchema>;

export type PaymentSourcePublicData = z.output<typeof PaymentSourcePublicDataSchema>;
export type PaymentSource = z.output<typeof PaymentSourceSchema>;
export type CreatePaymentSourceInput = z.output<typeof CreatePaymentSourceInputSchema>;

export type CustomerReference = z.output<typeof CustomerReferenceSchema>;
export type PaymentLinkCustomerData = z.output<typeof PaymentLinkCustomerDataSchema>;
export type TaxByAmount = z.output<typeof TaxByAmountSchema>;
export type TaxByPercentage = z.output<typeof TaxByPercentageSchema>;
export type Tax = z.output<typeof TaxSchema>;
export type CreatePaymentLinkInput = z.output<typeof CreatePaymentLinkInputSchema>;
export type PaymentLink = z.output<typeof PaymentLinkSchema>;
export type UpdatePaymentLinkInput = z.output<typeof UpdatePaymentLinkInputSchema>;

export type PresignedAcceptance = z.output<typeof PresignedAcceptanceSchema>;
export type Merchant = z.output<typeof MerchantSchema>;

export type FinancialInstitution = z.output<typeof FinancialInstitutionSchema>;

export type BrebKeyType = z.output<typeof BrebKeyTypeSchema>;
export type PayoutPaymentType = z.output<typeof PayoutPaymentTypeSchema>;
export type PayoutTransactionStatus = z.output<typeof PayoutTransactionStatusSchema>;
export type PayoutStatus = z.output<typeof PayoutStatusSchema>;
export type PayoutLegalIdType = z.output<typeof PayoutLegalIdTypeSchema>;
export type PayoutPersonType = z.output<typeof PayoutPersonTypeSchema>;
export type PayoutAccountType = z.output<typeof PayoutAccountTypeSchema>;
export type BrebFinancialEntity = z.output<typeof BrebFinancialEntitySchema>;
export type BrebKeyResolution = z.output<typeof BrebKeyResolutionSchema>;
export type PayoutRecurring = z.output<typeof PayoutRecurringSchema>;
export type PayoutTransactionInput = z.output<typeof PayoutTransactionInputSchema>;
export type CreatePayoutInput = z.output<typeof CreatePayoutInputSchema>;
export type CreatePayoutResult = z.output<typeof CreatePayoutResultSchema>;
export type PayoutPayee = z.output<typeof PayoutPayeeSchema>;
export type PayoutFailureReason = z.output<typeof PayoutFailureReasonSchema>;
export type PayoutTransaction = z.output<typeof PayoutTransactionSchema>;
export type PayoutTransactionPage = z.output<typeof PayoutTransactionPageSchema>;
export type Payout = z.output<typeof PayoutSchema>;
export type PayoutsCredentials = z.output<typeof PayoutsCredentialsSchema>;

export type WebhookSignature = z.output<typeof WebhookSignatureSchema>;
export type WebhookEvent = z.output<typeof WebhookEventSchema>;
export type PayoutWebhookEvent = z.output<typeof PayoutWebhookEventSchema>;
export type TransactionUpdatedEvent = z.output<typeof TransactionUpdatedEventSchema>;
export type NequiTokenUpdatedEvent = z.output<typeof NequiTokenUpdatedEventSchema>;
export type PayoutTransactionUpdatedEvent = z.output<typeof PayoutTransactionUpdatedEventSchema>;
export type PayoutUpdatedEvent = z.output<typeof PayoutUpdatedEventSchema>;

export type NotFoundErrorResponse = z.output<typeof NotFoundErrorResponseSchema>;
export type InputValidationErrorResponse = z.output<typeof InputValidationErrorResponseSchema>;

export type WompiClientOptions = z.input<typeof WompiClientOptionsSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class WompiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WompiError";
  }
}

export class WompiNotFoundError extends WompiError {
  readonly type = "NOT_FOUND_ERROR" as const;
  readonly reason: string;

  constructor(response: NotFoundErrorResponse) {
    super(response.error.reason);
    this.name = "WompiNotFoundError";
    this.reason = response.error.reason;
  }
}

export class WompiValidationError extends WompiError {
  readonly type = "INPUT_VALIDATION_ERROR" as const;
  readonly messages: Record<string, string[]>;

  constructor(response: InputValidationErrorResponse) {
    const flatMessages = Object.entries(response.error.messages)
      .map(([field, errors]) => `${field}: ${errors.join(", ")}`)
      .join("; ");

    super(`Validation failed: ${flatMessages}`);
    this.name = "WompiValidationError";
    this.messages = response.error.messages;
  }
}

export class WompiRequestError extends WompiError {
  readonly statusCode: number;
  readonly body: unknown;

  constructor(statusCode: number, body: unknown) {
    super(`Request failed with status ${statusCode}`);
    this.name = "WompiRequestError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

export class WompiWebhookVerificationError extends WompiError {
  readonly type = "WEBHOOK_VERIFICATION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "WompiWebhookVerificationError";
  }
}

/**
 * Every error a {@link Result} can carry. The subclasses expose discriminants
 * (`.type` on not-found / validation errors, `.statusCode` on request errors), so
 * consumers can branch without `instanceof`.
 */
export type WompiErrorResult =
  | WompiError
  | WompiNotFoundError
  | WompiRequestError
  | WompiValidationError
  | WompiWebhookVerificationError;

/**
 * Discriminated result tuple for error-first handling.
 *
 * Usage:
 * ```ts
 * const [error, data] = await wompi.transactions.getTransaction("id");
 * if (error) {
 *   // error is a WompiError (or one of its subclasses)
 *   return;
 * }
 * // data is fully typed
 * ```
 */
export type Result<T> = [error: WompiErrorResult, data: null] | [error: null, data: T];
