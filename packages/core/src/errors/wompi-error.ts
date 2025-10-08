export class WompiError extends Error {
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, options?: { status?: number; details?: unknown }) {
    super(message);
    this.name = "[WompiError]";
    this.status = options?.status;
    this.details = options?.details;
  }
}
