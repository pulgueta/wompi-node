import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { WompiRequest } from "../src/request";
import {
  WompiNotFoundError,
  WompiValidationError,
  WompiRequestError,
  WompiError,
} from "../src/schemas";
import { okJson, okEmpty, errorJson } from "./helpers";

const TestSchema = z.object({ data: z.string() });

// Expose protected methods for testing
class TestableWompiRequest extends WompiRequest {
  async testGet<T>(endpoint: string, schema: z.ZodType<T>, headers?: Record<string, string>) {
    return this.get(endpoint, schema, headers);
  }

  async testPost<T>(
    endpoint: string,
    schema: z.ZodType<T>,
    body?: unknown,
    headers?: Record<string, string>
  ) {
    return this.post(endpoint, schema, body, headers);
  }

  async testPatch<T>(
    endpoint: string,
    schema: z.ZodType<T>,
    body?: unknown,
    headers?: Record<string, string>
  ) {
    return this.patch(endpoint, schema, body, headers);
  }
}

describe("WompiRequest", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should use production URL by default", async () => {
    const request = new TestableWompiRequest();

    mockFetch.mockResolvedValueOnce(okJson({ data: "test" }));

    await request.testGet("/test", TestSchema);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://production.wompi.co/v1/test",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("should use sandbox URL when sandbox is true", async () => {
    const request = new TestableWompiRequest({ sandbox: true });

    mockFetch.mockResolvedValueOnce(okJson({ data: "test" }));

    await request.testGet("/test", TestSchema);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://sandbox.wompi.co/v1/test",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("should return [null, data] on successful GET", async () => {
    const request = new TestableWompiRequest();

    mockFetch.mockResolvedValueOnce(okJson({ data: "result" }));

    const [error, data] = await request.testGet("/endpoint", TestSchema, {
      Authorization: "Bearer test-key",
    });

    expect(error).toBeNull();
    expect(data).toEqual({ data: "result" });
  });

  it("should return [null, data] on successful POST with body", async () => {
    const request = new TestableWompiRequest();
    const body = { amount: 100000 };

    mockFetch.mockResolvedValueOnce(okJson({ data: "created" }));

    const [error, data] = await request.testPost("/transactions", TestSchema, body, {
      Authorization: "Bearer test-key",
    });

    expect(error).toBeNull();
    expect(data).toEqual({ data: "created" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://production.wompi.co/v1/transactions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      })
    );
  });

  it("should return [null, data] on successful PATCH", async () => {
    const request = new TestableWompiRequest();

    mockFetch.mockResolvedValueOnce(okJson({ data: "patched" }));

    const [error, data] = await request.testPatch("/resource/1", TestSchema, { active: false });

    expect(error).toBeNull();
    expect(data).toEqual({ data: "patched" });
  });

  it("should resolve an empty 2xx body to undefined", async () => {
    const request = new TestableWompiRequest();
    const OptionalSchema = z.object({ data: z.string() }).optional();

    mockFetch.mockResolvedValueOnce(okEmpty());

    const [error, data] = await request.testPost("/transactions/txn-1/void", OptionalSchema);

    expect(error).toBeNull();
    expect(data).toBeUndefined();
  });

  it("should return [WompiNotFoundError, null] on 404", async () => {
    const request = new TestableWompiRequest();

    mockFetch.mockResolvedValueOnce(
      errorJson(404, {
        error: {
          type: "NOT_FOUND_ERROR",
          reason: "La entidad solicitada no existe",
        },
      })
    );

    const [error, data] = await request.testGet("/transactions/invalid", TestSchema);

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WompiNotFoundError);
  });

  it("should return [WompiValidationError, null] on 422", async () => {
    const request = new TestableWompiRequest();

    mockFetch.mockResolvedValueOnce(
      errorJson(422, {
        error: {
          type: "INPUT_VALIDATION_ERROR",
          messages: { amount_in_cents: ["No está presente"] },
        },
      })
    );

    const [error, data] = await request.testPost("/transactions", TestSchema, {});

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WompiValidationError);
  });

  it("should return [WompiRequestError, null] on other error statuses", async () => {
    const request = new TestableWompiRequest();

    mockFetch.mockResolvedValueOnce(errorJson(500, null));

    const [error, data] = await request.testGet("/test", TestSchema);

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WompiRequestError);
  });

  it("does not classify a flat payments error as a payouts error", async () => {
    const request = new TestableWompiRequest();

    mockFetch.mockResolvedValueOnce(
      errorJson(400, { code: "PAYMENTS_ERROR", message: "Payments request failed" })
    );

    const [error, data] = await request.testGet("/test", TestSchema);

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WompiRequestError);
    expect((error as WompiRequestError).body).toEqual({
      code: "PAYMENTS_ERROR",
      message: "Payments request failed",
    });
  });

  it("should return [WompiRequestError, null] on network error", async () => {
    const request = new TestableWompiRequest();

    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const [error, data] = await request.testGet("/test", TestSchema);

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WompiRequestError);
    expect((error as WompiRequestError).statusCode).toBe(0);
  });

  it("should return [WompiError, null] when response fails schema validation", async () => {
    const request = new TestableWompiRequest();
    const StrictSchema = z.object({ data: z.number() });

    mockFetch.mockResolvedValueOnce(okJson({ data: "not-a-number" }));

    const [error, data] = await request.testGet("/test", StrictSchema);

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WompiError);
    expect(error!.message).toContain("Response validation failed");
  });

  it("should not send body for GET requests", async () => {
    const request = new TestableWompiRequest();

    mockFetch.mockResolvedValueOnce(okJson({ data: "ok" }));

    await request.testGet("/test", TestSchema);

    const callArgs = mockFetch.mock.calls[0]![1]!;
    expect(callArgs.body).toBeUndefined();
  });
});
