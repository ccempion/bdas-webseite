/**
 * Typed error hierarchy used across all modules.
 * Service layers throw these; route handlers translate them to HTTP responses.
 */

export type AppErrorJSON = {
  readonly code: string;
  readonly message: string;
  readonly statusCode: number;
  readonly fields?: Record<string, string>;
};

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(args: { code: string; message: string; statusCode: number; cause?: unknown }) {
    super(args.message);
    this.name = this.constructor.name;
    this.code = args.code;
    this.statusCode = args.statusCode;
    if (args.cause !== undefined) {
      (this as { cause?: unknown }).cause = args.cause;
    }
  }

  toJSON(): AppErrorJSON {
    return { code: this.code, message: this.message, statusCode: this.statusCode };
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, opts?: { cause?: unknown }) {
    super({ code: "NOT_FOUND", message, statusCode: 404, ...(opts ?? {}) });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, opts?: { cause?: unknown }) {
    super({ code: "UNAUTHORIZED", message, statusCode: 401, ...(opts ?? {}) });
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, opts?: { cause?: unknown }) {
    super({ code: "FORBIDDEN", message, statusCode: 403, ...(opts ?? {}) });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, opts?: { cause?: unknown }) {
    super({ code: "CONFLICT", message, statusCode: 409, ...(opts ?? {}) });
  }
}

export class ValidationError extends AppError {
  readonly fields: Record<string, string> | undefined;
  constructor(message: string, opts?: { fields?: Record<string, string>; cause?: unknown }) {
    super({ code: "VALIDATION", message, statusCode: 400, cause: opts?.cause });
    this.fields = opts?.fields;
  }

  override toJSON(): AppErrorJSON {
    const base = super.toJSON();
    return this.fields ? { ...base, fields: this.fields } : base;
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, opts?: { cause?: unknown }) {
    super({ code: "RATE_LIMITED", message, statusCode: 429, ...(opts ?? {}) });
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
