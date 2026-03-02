import { describe, it, expect } from "vitest";
import {
  WompiError,
  WompiNotFoundError,
  WompiValidationError,
  WompiRequestError,
} from "../src/errors/wompi-error";

describe("WompiError", () => {
  it("should create with a message", () => {
    const error = new WompiError("Something went wrong");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(WompiError);
    expect(error.message).toBe("Something went wrong");
    expect(error.name).toBe("WompiError");
  });
});

describe("WompiNotFoundError", () => {
  it("should create from a NOT_FOUND_ERROR response", () => {
    const error = new WompiNotFoundError({
      error: {
        type: "NOT_FOUND_ERROR",
        reason: "La entidad solicitada no existe",
      },
    });

    expect(error).toBeInstanceOf(WompiError);
    expect(error).toBeInstanceOf(WompiNotFoundError);
    expect(error.name).toBe("WompiNotFoundError");
    expect(error.type).toBe("NOT_FOUND_ERROR");
    expect(error.reason).toBe("La entidad solicitada no existe");
    expect(error.message).toBe("La entidad solicitada no existe");
  });
});

describe("WompiValidationError", () => {
  it("should create from an INPUT_VALIDATION_ERROR response", () => {
    const error = new WompiValidationError({
      error: {
        type: "INPUT_VALIDATION_ERROR",
        messages: {
          amount_in_cents: ["No está presente", "Debe ser mayor a 0"],
          reference: ["No está presente"],
        },
      },
    });

    expect(error).toBeInstanceOf(WompiError);
    expect(error).toBeInstanceOf(WompiValidationError);
    expect(error.name).toBe("WompiValidationError");
    expect(error.type).toBe("INPUT_VALIDATION_ERROR");
    expect(error.messages).toEqual({
      amount_in_cents: ["No está presente", "Debe ser mayor a 0"],
      reference: ["No está presente"],
    });
    expect(error.message).toContain("Validation failed");
    expect(error.message).toContain("amount_in_cents");
    expect(error.message).toContain("reference");
  });
});

describe("WompiRequestError", () => {
  it("should create with a status code and body", () => {
    const error = new WompiRequestError(500, { error: "Internal Server Error" });

    expect(error).toBeInstanceOf(WompiError);
    expect(error).toBeInstanceOf(WompiRequestError);
    expect(error.name).toBe("WompiRequestError");
    expect(error.statusCode).toBe(500);
    expect(error.body).toEqual({ error: "Internal Server Error" });
    expect(error.message).toBe("Request failed with status 500");
  });

  it("should handle null body", () => {
    const error = new WompiRequestError(503, null);

    expect(error.statusCode).toBe(503);
    expect(error.body).toBeNull();
  });
});
