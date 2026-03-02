import { z } from "zod";

export const CurrencySchema = z.literal("COP");

export const PaymentMethodTypeSchema = z.enum([
  "CARD",
  "NEQUI",
  "PSE",
  "BANCOLOMBIA",
  "BANCOLOMBIA_TRANSFER",
  "BANCOLOMBIA_COLLECT",
  "BANCOLOMBIA_QR",
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

export const CreateTransactionInputSchema = z.object({
  acceptance_token: z.string(),
  amount_in_cents: z.number().int().min(1),
  currency: CurrencySchema,
  signature: z.string(),
  customer_email: z.string().email(),
  payment_method: TransactionPaymentMethodSchema.optional(),
  payment_source_id: z.number().int().optional(),
  redirect_url: z.string().url().optional(),
  reference: z.string(),
  expiration_time: z.string().optional(),
  customer_data: CustomerDataSchema.optional(),
  shipping_address: ShippingAddressSchema.optional(),
});

export const TransactionSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  amount_in_cents: z.number().int(),
  status: TransactionStatusSchema,
  reference: z.string(),
  customer_email: z.string(),
  currency: CurrencySchema,
  payment_method_type: PaymentMethodTypeSchema,
  payment_method: TransactionPaymentMethodSchema,
  shipping_address: ShippingAddressSchema.nullable(),
  redirect_url: z.string().nullable(),
  payment_link_id: z.string().nullable(),
});

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
  page: z.number().int().min(1).optional(),
  page_size: z.number().int().min(1).max(200).optional(),
  id: z.string().optional(),
  payment_method_type: PaymentMethodTypeSchema.optional(),
  status: TransactionStatusSchema.optional(),
  customer_email: z.string().email().optional(),
  order_by: z.string().optional(),
  order: OrderDirectionSchema.optional(),
});

export const VoidTransactionInputSchema = z.object({
  amount_in_cents: z.number().int().min(1).optional(),
});

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

export const CardTokenSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  brand: z.string(),
  name: z.string(),
  last_four: z.string(),
  bin: z.string(),
  exp_year: z.string(),
  exp_month: z.string(),
  card_holder: z.string(),
  expires_at: z.string(),
});

export const NequiTokenSchema = z.object({
  id: z.string(),
  status: NequiTokenStatusSchema,
  phone_number: z.string(),
  name: z.string(),
});

export const PaymentSourcePublicDataSchema = z.object({
  type: PaymentSourceTypeSchema,
  phone_number: z.string().optional(),
});

export const PaymentSourceSchema = z.object({
  id: z.number().int(),
  type: PaymentSourceTypeSchema,
  token: z.string(),
  status: PaymentSourceStatusSchema,
  customer_email: z.string(),
  public_data: PaymentSourcePublicDataSchema,
});

export const CreatePaymentSourceInputSchema = z.object({
  type: PaymentSourceTypeSchema,
  token: z.string(),
  acceptance_token: z.string(),
  customer_email: z.string().email(),
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
  amount_in_cents: z.number().int().min(1),
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
  amount_in_cents: z.number().int().min(1).optional(),
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

export const PaymentLinkSchema = CreatePaymentLinkInputSchema.extend({
  id: z.string(),
  active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const UpdatePaymentLinkInputSchema = z.object({
  active: z.boolean(),
});

export const PresignedAcceptanceSchema = z.object({
  acceptance_token: z.string(),
  permalink: z.string(),
  type: AcceptanceTypeSchema,
});

export const MerchantSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  legal_name: z.string(),
  legal_id: z.string(),
  legal_id_type: MerchantLegalIdTypeSchema,
  phone_number: z.string(),
  active: z.boolean(),
  logo_url: z.string().nullable(),
  email: z.string(),
  contact_name: z.string(),
  public_key: z.string(),
  accepted_payment_methods: z.array(PaymentMethodTypeSchema),
  accepted_currencies: z.array(CurrencySchema),
  presigned_acceptance: PresignedAcceptanceSchema,
});

export const FinancialInstitutionSchema = z.object({
  financial_institution_code: z.string(),
  financial_institution_name: z.string(),
});

export const wompiResponse = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: z.record(z.string(), z.unknown()).optional(),
  });

export const wompiListResponse = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: z.record(z.string(), z.unknown()).optional(),
  });

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
