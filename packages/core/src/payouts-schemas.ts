import { z } from "zod";

import { MAX_AMOUNT_IN_CENTS, WebhookSignatureSchema, WompiError } from "@/payments-schemas";

// ---------------------------------------------------------------------------
// Payouts — Pagos a Terceros (dispersiones a cuenta bancaria)
//
// The Payouts API lives on its own host (`api.payouts.wompi.co`), authenticates
// with `x-api-key` + `user-principal-id` headers instead of Bearer keys, and
// uses camelCase field names — unlike the snake_case payments API.
// ---------------------------------------------------------------------------

export const PayoutPaymentTypeSchema = z.enum(["PAYROLL", "PROVIDERS", "OTHER"]);

export const PayoutStatusSchema = z.enum([
  "PENDING",
  "REJECTED",
  "TOTAL_PAYMENT",
  "PARTIAL_PAYMENT",
  "PENDING_APPROVAL",
  "NOT_APPROVED",
  "AFE_REJECTED",
  "AFE_ON_HOLD",
]);

export const PayoutTransactionStatusSchema = z.enum([
  "PROCESSING",
  "PENDING",
  "APPROVED",
  "FAILED",
  "REJECTED",
  "CANCELLED",
  "READY_TO_FILE",
  "ADDED_TO_FILE",
]);

export const PayoutAccountTypeSchema = z.enum(["AHORROS", "CORRIENTE", "DEPOSITO_ELECTRONICO"]);

export const PayoutLegalIdTypeSchema = z.enum(["CC", "NIT", "PP", "CE", "TI", "DNI"]);

export const PayoutPersonTypeSchema = z.enum(["NATURAL", "JURIDICA"]);

export const PayoutAccountStatusSchema = z.enum(["IN_REVIEW", "ACTIVE", "INACTIVE"]);

export const PayoutFileTypeSchema = z.enum([
  "WOMPI",
  "PAB",
  "SAP",
  "DISFON",
  "BANCO_OCCIDENTE_FC",
  "DAVIVIENDA",
]);

/** File extension required by each format in Wompi's batch file table. */
export const PAYOUT_FILE_EXTENSIONS = {
  WOMPI: ".csv",
  PAB: ".txt",
  SAP: ".txt",
  DISFON: ".txt",
  BANCO_OCCIDENTE_FC: ".txt",
  DAVIVIENDA: ".txt",
} as const;

/**
 * `idempotency-key` header sent when creating a batch: 1–64 characters, letters,
 * numbers and hyphens only. Wompi keeps it unique for 24 hours to prevent
 * duplicate payouts.
 */
export const PayoutIdempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,64}$/, "Must be 1-64 characters of letters, numbers or hyphens");

const DispersionDatetimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Must be YYYY-MM-DDTHH:mm format");

export const PayoutRecurringSchema = z.object({
  interval: z.enum(["biweek", "month"]),
  months: z.union([z.literal(3), z.literal(6), z.literal(12)]),
  description: z.string().optional(),
});

export const CreatePayoutTransactionSchema = z.object({
  legalIdType: PayoutLegalIdTypeSchema,
  legalId: z.string(),
  bankId: z.string(),
  accountType: PayoutAccountTypeSchema,
  accountNumber: z
    .string()
    .regex(/^(?=.*[1-9])\d{6,20}$/, "Must be 6-20 digits and different from zero"),
  name: z.string(),
  amount: z.number().int().min(1).max(MAX_AMOUNT_IN_CENTS),
  /** Included by Wompi's OpenAPI and Postman contracts; older prose examples omit it. */
  personType: PayoutPersonTypeSchema.optional(),
  description: z.string().optional(),
  phone: z.string().optional(),
  email: z.email().optional(),
  reference: z.string().optional(),
});

export const CreatePayoutInputSchema = z
  .object({
    reference: z.string(),
    accountId: z.string(),
    paymentType: PayoutPaymentTypeSchema,
    /** Sandbox only: forces the final state of every transaction in the batch. */
    transactionStatus: z.enum(["APPROVED", "FAILED"]).optional(),
    /** Schedules the batch. Must be at least the day after the request. */
    dispersionDatetime: DispersionDatetimeSchema.optional(),
    recurring: PayoutRecurringSchema.optional(),
    transactions: z.array(CreatePayoutTransactionSchema).min(1),
  })
  .refine((data) => data.recurring === undefined || data.dispersionDatetime !== undefined, {
    message: "Recurring payouts require dispersionDatetime",
  });

/**
 * Compressed batch uploads must carry the `.gz` extension and the
 * `application/gzip` MIME, per Wompi's file upload contract.
 */
export const isGzipPayoutFile = (file: Blob): boolean => {
  if (typeof File !== "undefined" && file instanceof File) {
    return file.type === "application/gzip" && file.name.toLowerCase().endsWith(".gz");
  }

  return file.type === "application/gzip";
};

export const CreatePayoutFileInputSchema = z
  .object({
    reference: z.string(),
    file: z.instanceof(Blob),
    fileType: PayoutFileTypeSchema,
    accountId: z.string(),
    paymentType: PayoutPaymentTypeSchema,
    /** Original file name with extension (before compressing). Required for `.gz` uploads. */
    fileName: z.string().trim().min(1, "Must not be blank").optional(),
    /** Original file MIME (before compressing). Required for `.gz` uploads. */
    fileMime: z.string().trim().min(1, "Must not be blank").optional(),
    /** Sandbox only: forces the final state of every transaction in the batch. */
    transactionStatus: z.enum(["APPROVED", "FAILED"]).optional(),
    /** Schedules the batch. Must be at least the day after the request. */
    dispersionDatetime: DispersionDatetimeSchema.optional(),
    interval: z.enum(["biweek", "month"]).optional(),
    months: z.union([z.literal(3), z.literal(6), z.literal(12)]).optional(),
    description: z.string().optional(),
  })
  .refine(
    (data) =>
      (data.interval === undefined && data.months === undefined) ||
      data.dispersionDatetime !== undefined,
    {
      message: "Recurring payouts require dispersionDatetime",
    }
  )
  .refine((data) => (data.interval === undefined) === (data.months === undefined), {
    message: "Recurring payouts require both interval and months",
  })
  .refine(
    (data) => {
      if (typeof File === "undefined" || !(data.file instanceof File)) return true;

      const hasGzipName = data.file.name.toLowerCase().endsWith(".gz");
      const hasGzipMime = data.file.type === "application/gzip";

      return hasGzipName === hasGzipMime;
    },
    {
      path: ["file"],
      message: "Compressed uploads require a .gz filename and application/gzip MIME",
    }
  )
  .superRefine((data, ctx) => {
    const expectedExtension = PAYOUT_FILE_EXTENSIONS[data.fileType];
    const compressed = isGzipPayoutFile(data.file);

    if (data.fileName && !data.fileName.toLowerCase().endsWith(expectedExtension)) {
      ctx.addIssue({
        code: "custom",
        path: ["fileName"],
        message: `${data.fileType} files must use the ${expectedExtension} extension`,
      });
    }

    if (
      !compressed &&
      typeof File !== "undefined" &&
      data.file instanceof File &&
      !data.file.name.toLowerCase().endsWith(expectedExtension)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["file"],
        message: `${data.fileType} files must use the ${expectedExtension} extension`,
      });
    }

    if (!compressed) return;

    for (const field of ["fileName", "fileMime"] as const) {
      if (data[field] === undefined || data[field].trim() === "") {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Required for compressed (.gz) uploads",
        });
      }
    }
  });

/**
 * Comma-separated query filter: accepts a single value or an array, which is
 * joined the way the Payouts API expects (`status=PENDING,REJECTED`).
 */
const commaList = <T extends z.ZodType<string>>(item: T) =>
  z.union([item, z.array(item).min(1)]).transform((v) => (Array.isArray(v) ? v.join(",") : v));

/** Array filter serialized as repeated query parameters (`status=A&status=B`). */
const repeatedList = <T extends z.ZodType<string>>(item: T) =>
  z.union([item, z.array(item).min(1)]);

const PayoutDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");

const PayoutPageParams = {
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional(),
};

export const PayoutListParamsSchema = z.object({
  status: commaList(PayoutStatusSchema).optional(),
  fromDate: PayoutDateSchema.optional(),
  toDate: PayoutDateSchema.optional(),
  reference: z.string().optional(),
  id: z.string().optional(),
  ...PayoutPageParams,
});

export const PayoutAccountListParamsSchema = z.object({
  bankCodes: commaList(z.string()).optional(),
  status: commaList(PayoutAccountStatusSchema).optional(),
});

export const PayoutTransactionListParamsSchema = z.object({
  status: commaList(PayoutTransactionStatusSchema).optional(),
  reference: z.string().optional(),
  accountNumber: z.string().optional(),
  payeeName: z.string().optional(),
  ...PayoutPageParams,
});

export const PayoutTransactionsByReferenceParamsSchema = z.object({
  status: repeatedList(PayoutTransactionStatusSchema).optional(),
  ...PayoutPageParams,
});

export const PayoutReportListParamsSchema = z.object({
  periodicity: z.enum(["daily", "weekly", "biweekly", "monthly"]),
  reportType: z.enum(["payouts", "transactions"]),
  ...PayoutPageParams,
});

export const PayoutReportUrlParamsSchema = z.object({
  reportExecutionId: z.string(),
  reportIntegration: z.enum(["payouts", "merchant_reports"]),
});

export const RechargePayoutAccountInputSchema = z.object({
  accountId: z.string(),
  /** Official sources disagree; accept their union and let the sandbox adjudicate it. */
  amountInCents: z.number().int().min(10_000).max(5_000_000_000),
});

/**
 * Response payload of `POST /payouts` and `POST /payouts/file`.
 *
 * Like every payments response schema, payout responses keep only their stable
 * identifiers required and stay loose otherwise — a successful API call must
 * never be reported as a validation error.
 */
export const CreatePayoutResultSchema = z
  .object({
    payoutId: z.string(),
    transactions: z.number().int().optional(),
    success: z.number().int().optional(),
    failed: z.number().int().optional(),
  })
  .loose();

export const PayoutPayerInfoSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    legalId: z.string().optional(),
    personType: z.string().optional(),
    legalIdType: z.string().optional(),
  })
  .loose();

/**
 * A payout batch. `status` stays a plain string — the REST API and webhook
 * events emit values beyond the documented {@link PayoutStatusSchema} set.
 */
export const PayoutSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    reference: z.string().optional(),
    type: z.string().optional(),
    amountInCents: z.number().int().optional(),
    currency: z.string().optional(),
    payerInfo: PayoutPayerInfoSchema.optional(),
    statusMessage: z.string().nullish(),
    totalTransactions: z.number().int().optional(),
    dispersionDatetime: z.string().nullish(),
    paymentType: z.string().optional(),
    createdAt: z.string().optional(),
  })
  .loose();

export const PayoutPayeeInfoSchema = z
  .object({
    bank: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    legalId: z.string().optional(),
    bankCode: z.string().optional(),
    accountType: z.string().optional(),
    legalIdType: z.string().optional(),
    accountNumber: z.string().optional(),
  })
  .loose();

export const PayoutFeeSchema = z
  .object({
    feeInCents: z.number().int().optional(),
    vatPercentage: z.number().optional(),
    gmfInCents: z.number().int().optional(),
    dynamicFeeInCents: z.number().int().optional(),
    vatInCents: z.number().int().optional(),
    totalInCents: z.number().int().optional(),
  })
  .loose();

/**
 * A plain string on the REST API, but an object on webhook events. Bank
 * dispersal events word it as `{ code, message }` while BRE-B events use
 * `{ code, description }` — both arrive on the same events URL.
 */
export const PayoutFailureReasonSchema = z.union([
  z.string(),
  z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
      description: z.string().optional(),
    })
    .loose(),
]);

export const PayoutTransactionSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    amountInCents: z.number().int().optional(),
    payeeInfo: PayoutPayeeInfoSchema.optional(),
    fee: PayoutFeeSchema.optional(),
    reference: z.string().nullish(),
    failureReason: PayoutFailureReasonSchema.nullish(),
    appliedAt: z.string().nullish(),
    createdAt: z.string().optional(),
    payout: PayoutSchema.optional(),
  })
  .loose();

/**
 * Beneficiary shape emitted by Payouts `transaction.updated` webhooks. The
 * official event example identifies the payee as `document`, while other
 * payloads carry `legalId`/`legalIdType`; BRE-B events on the same URL have
 * no `bank`. Everything beyond `name` and `accountNumber` is optional so no
 * documented variant fails the guard.
 */
export const PayoutEventPayeeSchema = z
  .object({
    name: z.string(),
    bank: z.string().optional(),
    accountNumber: z.string(),
    accountType: z.string().optional(),
    document: z.string().optional(),
    legalId: z.string().optional(),
    legalIdType: z.string().optional(),
    email: z.string().optional(),
  })
  .loose();

/** Transaction payload emitted by Payouts webhooks (distinct from the REST shape). */
export const PayoutEventTransactionSchema = z
  .object({
    id: z.string(),
    payoutId: z.string(),
    amountInCents: z.number().int(),
    status: z.string(),
    payee: PayoutEventPayeeSchema,
    failureReason: PayoutFailureReasonSchema.nullish(),
    currency: z.string(),
  })
  .loose();

export const PayoutBankSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    code: z.string().optional(),
    achCode: z.union([z.string(), z.number()]).nullish(),
    swiftCode: z.string().nullish(),
    allowedForOrigin: z.boolean().optional(),
    isElectronicDeposit: z.boolean().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .loose();

export const PayoutAccountSchema = z
  .object({
    id: z.string(),
    balanceInCents: z.number().int().optional(),
    number: z.string().optional(),
    status: z.string().optional(),
    accountType: z.string().optional(),
    bank: z.object({ code: z.string().optional(), name: z.string().optional() }).loose().optional(),
    updatedAt: z.string().optional(),
  })
  .loose();

export const PayoutLimitsSchema = z
  .object({
    numberOfTransactionsConsumed: z.number().int().optional(),
    limits: z
      .object({
        dailyLimit: z.number().int().optional(),
        dailyAvailable: z.number().int().optional(),
        dailyConsumed: z.number().int().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

export const PayoutReportSchema = z
  .object({
    _id: z.string(),
    reportId: z.string().optional(),
    runAt: z.string().optional(),
    status: z.string().optional(),
    stackTrace: z.string().nullish(),
    queryStartDate: z.string().optional(),
    queryEndDate: z.string().optional(),
    fileBucketKey: z.string().optional(),
  })
  .loose();

export const PayoutHealthSchema = z
  .object({
    status: z.enum(["HEALTHY", "PARTIAL_OUTAGE", "UNHEALTHY"]),
    services: z.array(z.object({ name: z.string(), healthy: z.boolean() }).loose()).optional(),
  })
  .loose();

/** Paginated `data` payload of the payout list endpoints. */
export const payoutPage = <T extends z.ZodType>(itemSchema: T) =>
  z
    .object({
      page: z.number().int().optional(),
      limit: z.number().int().optional(),
      total: z.number().int().optional(),
      pages: z.number().int().optional(),
      records: z.array(itemSchema),
    })
    .loose();

/** `GET /reports/payouts` paginates under `reports` instead of `records`. */
export const PayoutReportPageSchema = z
  .object({
    page: z.number().int().optional(),
    limit: z.number().int().optional(),
    total: z.number().int().optional(),
    pages: z.number().int().optional(),
    reports: z.array(PayoutReportSchema),
  })
  .loose();

/**
 * Envelope of every event the Payouts API POSTs to the configured Events URL.
 * Unlike payments webhooks there is no `environment` field, and the send date
 * arrives camelCased as `sentAt`.
 */
export const PayoutEventSchema = z
  .object({
    event: z.string(),
    data: z.record(z.string(), z.unknown()),
    signature: WebhookSignatureSchema,
    timestamp: z.number(),
    sentAt: z.string().optional(),
  })
  .loose();

export const PayoutUpdatedEventSchema = z
  .object({
    event: z.literal("payout.updated"),
    data: z.object({ payout: PayoutSchema }),
    signature: WebhookSignatureSchema,
    timestamp: z.number(),
    sentAt: z.string().optional(),
  })
  .loose();

export const PayoutTransactionUpdatedEventSchema = z
  .object({
    event: z.literal("transaction.updated"),
    data: z.object({ transaction: PayoutEventTransactionSchema }),
    signature: WebhookSignatureSchema,
    timestamp: z.number(),
    sentAt: z.string().optional(),
  })
  .loose();

/** Error body of the Payouts API, preserving service diagnostics and trace metadata. */
export const PayoutApiErrorResponseSchema = z
  .object({
    code: z.string(),
    /** A sentence on most errors; validation 400s answer with an array of issues. */
    message: z.union([z.string(), z.array(z.string())]),
    type: z.string().optional(),
    data: z.unknown().optional(),
    meta: z.object({ trace_id: z.string().optional() }).loose().optional(),
  })
  .loose();

export const WompiPayoutsClientOptionsSchema = z.object({
  apiKey: z.string().min(1, "An API key is required"),
  userPrincipalId: z.string().min(1, "A user principal ID is required"),
  sandbox: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PayoutPaymentType = z.output<typeof PayoutPaymentTypeSchema>;
export type PayoutStatus = z.output<typeof PayoutStatusSchema>;
export type PayoutTransactionStatus = z.output<typeof PayoutTransactionStatusSchema>;
export type PayoutAccountType = z.output<typeof PayoutAccountTypeSchema>;
export type PayoutLegalIdType = z.output<typeof PayoutLegalIdTypeSchema>;
export type PayoutPersonType = z.output<typeof PayoutPersonTypeSchema>;
export type PayoutAccountStatus = z.output<typeof PayoutAccountStatusSchema>;
export type PayoutFileType = z.output<typeof PayoutFileTypeSchema>;

export type PayoutRecurring = z.output<typeof PayoutRecurringSchema>;
export type CreatePayoutTransaction = z.output<typeof CreatePayoutTransactionSchema>;
export type CreatePayoutInput = z.output<typeof CreatePayoutInputSchema>;
export type CreatePayoutFileInput = z.output<typeof CreatePayoutFileInputSchema>;
export type CreatePayoutResult = z.output<typeof CreatePayoutResultSchema>;

export type PayoutListParams = z.input<typeof PayoutListParamsSchema>;
export type PayoutAccountListParams = z.input<typeof PayoutAccountListParamsSchema>;
export type PayoutTransactionListParams = z.input<typeof PayoutTransactionListParamsSchema>;
export type PayoutTransactionsByReferenceParams = z.input<
  typeof PayoutTransactionsByReferenceParamsSchema
>;
export type PayoutReportListParams = z.input<typeof PayoutReportListParamsSchema>;
export type PayoutReportUrlParams = z.input<typeof PayoutReportUrlParamsSchema>;
export type RechargePayoutAccountInput = z.output<typeof RechargePayoutAccountInputSchema>;

export type PayoutPayerInfo = z.output<typeof PayoutPayerInfoSchema>;
export type Payout = z.output<typeof PayoutSchema>;
export type PayoutPayeeInfo = z.output<typeof PayoutPayeeInfoSchema>;
export type PayoutFee = z.output<typeof PayoutFeeSchema>;
export type PayoutTransaction = z.output<typeof PayoutTransactionSchema>;
export type PayoutEventPayee = z.output<typeof PayoutEventPayeeSchema>;
export type PayoutEventTransaction = z.output<typeof PayoutEventTransactionSchema>;
export type PayoutBank = z.output<typeof PayoutBankSchema>;
export type PayoutAccount = z.output<typeof PayoutAccountSchema>;
export type PayoutLimits = z.output<typeof PayoutLimitsSchema>;
export type PayoutReport = z.output<typeof PayoutReportSchema>;
export type PayoutReportPage = z.output<typeof PayoutReportPageSchema>;
export type PayoutHealth = z.output<typeof PayoutHealthSchema>;
export type PayoutPage<T> = {
  page?: number;
  limit?: number;
  total?: number;
  pages?: number;
  records: T[];
};

export type PayoutEvent = z.output<typeof PayoutEventSchema>;
export type PayoutUpdatedEvent = z.output<typeof PayoutUpdatedEventSchema>;
export type PayoutTransactionUpdatedEvent = z.output<typeof PayoutTransactionUpdatedEventSchema>;

export type PayoutApiErrorResponse = z.output<typeof PayoutApiErrorResponseSchema>;
export type WompiPayoutsClientOptions = z.input<typeof WompiPayoutsClientOptionsSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class WompiPayoutApiError extends WompiError {
  readonly type = "PAYOUT_API_ERROR" as const;
  readonly code: string;
  readonly statusCode: number;
  readonly body: PayoutApiErrorResponse;

  constructor(statusCode: number, response: PayoutApiErrorResponse) {
    super(`${response.code}: ${response.message}`);
    this.name = "WompiPayoutApiError";
    this.code = response.code;
    this.statusCode = statusCode;
    this.body = response;
  }
}
