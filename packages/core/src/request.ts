import type { z } from "zod";

import {
  InputValidationErrorResponseSchema,
  NotFoundErrorResponseSchema,
  WompiError,
  WompiNotFoundError,
  WompiRequestError,
  WompiValidationError,
} from "@/schemas";
import type { Result } from "@/schemas";

const BASE_URLS = {
  production: "https://production.wompi.co/v1",
  sandbox: "https://sandbox.wompi.co/v1",
} as const;

export type WompiRequestConfig = {
  sandbox?: boolean;
  timeoutMs?: number;
  /** Overrides the payments base URL — used by the Payouts API, which lives on its own host. */
  baseUrl?: string;
  /** Maps product-specific non-2xx response bodies without leaking them into the shared transport. */
  errorMapper?: (statusCode: number, body: unknown) => WompiError | null;
};

export class WompiRequest {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly errorMapper?: WompiRequestConfig["errorMapper"];

  constructor(config?: WompiRequestConfig) {
    this.baseUrl = config?.baseUrl ?? (config?.sandbox ? BASE_URLS.sandbox : BASE_URLS.production);
    this.timeoutMs = config?.timeoutMs ?? 30_000;
    this.errorMapper = config?.errorMapper;
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH",
    endpoint: string,
    schema: z.ZodType<T>,
    options: {
      headers?: Record<string, string>;
      body?: unknown;
    } = {}
  ): Promise<Result<T>> {
    const { headers, body } = options;

    let response: Response;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    // FormData bodies (payout file batches) must go through untouched so fetch
    // sets the multipart boundary itself — forcing a JSON Content-Type breaks them.
    const isFormData = body instanceof FormData;

    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: isFormData ? { ...headers } : { "Content-Type": "application/json", ...headers },
        body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      return [new WompiRequestError(0, err instanceof Error ? err.message : "Network error"), null];
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const raw = await response.json().catch(() => null);

      const notFound = NotFoundErrorResponseSchema.safeParse(raw);
      if (response.status === 404 && notFound.success) {
        return [new WompiNotFoundError(notFound.data), null];
      }

      const validation = InputValidationErrorResponseSchema.safeParse(raw);
      if (response.status === 422 && validation.success) {
        return [new WompiValidationError(validation.data), null];
      }

      const mappedError = this.errorMapper?.(response.status, raw);
      if (mappedError) return [mappedError, null];

      return [new WompiRequestError(response.status, raw), null];
    }

    // Read the body as text so an empty 2xx response (e.g. void's `201`) resolves to
    // `undefined` rather than a `null` that would fail schema validation on success.
    const text = await response.text().catch(() => "");

    let raw: unknown;
    if (text.length === 0) {
      raw = undefined;
    } else {
      try {
        raw = JSON.parse(text);
      } catch {
        return [
          new WompiRequestError(response.status, "Invalid JSON in successful response"),
          null,
        ];
      }
    }

    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      return [
        new WompiError(
          `Response validation failed: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        ),
        null,
      ];
    }

    return [null, parsed.data];
  }

  protected async get<T>(
    endpoint: string,
    schema: z.ZodType<T>,
    headers?: Record<string, string>
  ): Promise<Result<T>> {
    return this.request("GET", endpoint, schema, { headers });
  }

  protected async post<T>(
    endpoint: string,
    schema: z.ZodType<T>,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<Result<T>> {
    return this.request("POST", endpoint, schema, { headers, body });
  }

  protected async patch<T>(
    endpoint: string,
    schema: z.ZodType<T>,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<Result<T>> {
    return this.request("PATCH", endpoint, schema, { headers, body });
  }
}
