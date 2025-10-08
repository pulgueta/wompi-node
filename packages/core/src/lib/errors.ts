export class WompiError extends Error {
  public readonly statusCode: number;
  public readonly type?: string;
  public readonly reason?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    type?: string,
    reason?: string
  ) {
    super(message);
    this.name = 'WompiError';
    this.statusCode = statusCode;
    this.type = type;
    this.reason = reason;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WompiError);
    }
  }
}
