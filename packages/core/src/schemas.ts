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

export const TransactionPaymentMethodSchema = z
  .object({
    type: z.string(),
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
  .refine(
    (data) => (data.payment_method === undefined) !== (data.payment_source_id === undefined),
    {
      message: "Provide exactly one of payment_method or payment_source_id",
    }
  );

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
    .transform((parsed) => parsed.data as z.output<T>);

export const wompiListResponse = <T extends z.ZodType>(itemSchema: T) =>
  z
    .object({
      data: z.array(itemSchema),
      meta: z.record(z.string(), z.unknown()).optional(),
    })
    .transform((parsed) => parsed.data);

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

export const WompiClientOptionsSchema = z.object({
  publicKey: z.string().min(1, "A public key is required"),
  privateKey: z.string().optional(),
  sandbox: z.boolean().default(false),
});
