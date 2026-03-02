import type { z } from "zod";

import {
  WompiError,
  WompiNotFoundError,
  WompiRequestError,
  WompiValidationError,
} from "@/errors/wompi-error";
import { NotFoundErrorResponseSchema, InputValidationErrorResponseSchema } from "@/schemas";
import type { Result } from "@/types";

const BASE_URLS = {
  production: "https://production.wompi.co/v1",
  sandbox: "https://sandbox.wompi.co/v1",
} as const;

export type WompiRequestConfig = {
  sandbox?: boolean;
};

export class WompiRequest {
  private readonly baseUrl: string;

  constructor(config?: WompiRequestConfig) {
    this.baseUrl = config?.sandbox ? BASE_URLS.sandbox : BASE_URLS.production;
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

    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      return [new WompiRequestError(0, err instanceof Error ? err.message : "Network error"), null];
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

    const raw = await response.json().catch(() => null);
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

export type { WompiRequestConfig as BaseConfig };
