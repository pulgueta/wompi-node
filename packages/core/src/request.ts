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
  payments: {
    production: "https://production.wompi.co/v1",
    sandbox: "https://sandbox.wompi.co/v1",
  },
  payouts: {
    production: "https://api.payouts.wompi.co/v2",
    sandbox: "https://api.sandbox.payouts.wompi.co/v2",
  },
} as const;

export type WompiRequestConfig = {
  sandbox?: boolean;
  timeoutMs?: number;
  /**
   * Which Wompi API the resource talks to. Payouts (Pagos a Terceros / BRE-B)
   * lives on a different host than the payments API. Defaults to `"payments"`.
   */
  api?: keyof typeof BASE_URLS;
};

export class WompiRequest {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config?: WompiRequestConfig) {
    const urls = BASE_URLS[config?.api ?? "payments"];
    this.baseUrl = config?.sandbox ? urls.sandbox : urls.production;
    this.timeoutMs = config?.timeoutMs ?? 30_000;
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

    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
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
