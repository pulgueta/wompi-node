import type { InputValidationErrorResponse, NotFoundErrorResponse } from "@/types";

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
