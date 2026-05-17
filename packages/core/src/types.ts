import type { z } from "zod";

import type {
  CurrencySchema,
  PaymentMethodTypeSchema,
  TransactionStatusSchema,
  PaymentSourceTypeSchema,
  PaymentSourceStatusSchema,
  NequiTokenStatusSchema,
  LegalIdTypeSchema,
  TaxTypeSchema,
  OrderDirectionSchema,
  AcceptanceTypeSchema,
  MerchantLegalIdTypeSchema,
  CustomerDataSchema,
  ShippingAddressSchema,
  TransactionPaymentMethodSchema,
  CreateTransactionInputSchema,
  TransactionSchema,
  TransactionListParamsSchema,
  VoidTransactionInputSchema,
  VoidTransactionResultSchema,
  TokenizeCardInputSchema,
  TokenizeNequiInputSchema,
  CardTokenSchema,
  NequiTokenSchema,
  PaymentSourcePublicDataSchema,
  PaymentSourceSchema,
  CreatePaymentSourceInputSchema,
  CustomerReferenceSchema,
  PaymentLinkCustomerDataSchema,
  TaxByAmountSchema,
  TaxByPercentageSchema,
  TaxSchema,
  CreatePaymentLinkInputSchema,
  PaymentLinkSchema,
  UpdatePaymentLinkInputSchema,
  PresignedAcceptanceSchema,
  MerchantSchema,
  FinancialInstitutionSchema,
  NotFoundErrorResponseSchema,
  InputValidationErrorResponseSchema,
  WompiClientOptionsSchema,
} from "@/schemas";

import type {
  WompiError,
  WompiNotFoundError,
  WompiRequestError,
  WompiValidationError,
} from "@/errors/wompi-error";

export type { WompiError, WompiNotFoundError, WompiRequestError, WompiValidationError };

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

export type NotFoundErrorResponse = z.output<typeof NotFoundErrorResponseSchema>;
export type InputValidationErrorResponse = z.output<typeof InputValidationErrorResponseSchema>;

export type WompiClientOptions = z.input<typeof WompiClientOptionsSchema>;

// ─── API Response Wrappers ──────────────────────────────────────────────────

export type WompiResponse<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

export type WompiListResponse<T> = {
  data: T[];
  meta?: Record<string, unknown>;
};

/**
 * Every error a {@link Result} can carry. The subclasses expose discriminants
 * (`.type` on not-found / validation errors, `.statusCode` on request errors), so
 * consumers can branch without `instanceof`.
 */
export type WompiErrorResult =
  | WompiError
  | WompiNotFoundError
  | WompiRequestError
  | WompiValidationError;

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
