import { describe, expect, it } from "vitest";
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  isAppError,
} from "./index.js";

describe("AppError hierarchy", () => {
  it("NotFoundError sets code and statusCode", () => {
    const err = new NotFoundError("user x not found");
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("user x not found");
  });

  it("toJSON returns serializable shape", () => {
    const err = new ForbiddenError("nope");
    expect(err.toJSON()).toEqual({
      code: "FORBIDDEN",
      message: "nope",
      statusCode: 403,
    });
  });

  it("ValidationError carries field-level errors", () => {
    const err = new ValidationError("invalid form", {
      fields: { email: "must be a valid email" },
    });
    expect(err.fields).toEqual({ email: "must be a valid email" });
    expect(err.toJSON()).toEqual({
      code: "VALIDATION",
      message: "invalid form",
      statusCode: 400,
      fields: { email: "must be a valid email" },
    });
  });

  it("isAppError type guard", () => {
    expect(isAppError(new NotFoundError("x"))).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError("nope")).toBe(false);
  });
});
