/**
 * @bdas/auth — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only the symbols re-exported here are visible to
 * other workspaces. Internal files are not importable across the boundary.
 */

// Services
export { register, RegisterInput, buildVerifyUrl, type RegisterResult } from "./services/register";
export { verifyEmail, type VerifyResult } from "./services/verify";
export { login, LoginInput, type LoginResult, type LoginContext } from "./services/login";
export { logout } from "./services/logout";
export {
  requestPasswordReset,
  completePasswordReset,
  buildResetUrl,
  ResetRequestInput,
  ResetCompleteInput,
} from "./services/password-reset";
export { getCurrentUser, requireRole, type CurrentUser } from "./services/me";
export { resendVerification, type ResendResult } from "./services/resend-verification";

// Password policy (UI shows the hint; schema is the single source of truth).
export { passwordSchema, PASSWORD_RULE_HINT, PASSWORD_MIN_LENGTH } from "./password";

// GDPR consent + self-service export (ADR 0008).
export { CONSENT_VERSION } from "./consent";
export { getUserExport, type UserExport } from "./services/export";

// SSO + cookie
export {
  COOKIE_NAME,
  COOKIE_MAX_AGE_SECONDS,
  TOKEN_VERSION,
  type Role,
  type SsoClaims,
} from "./sso";

// Notifier (composition root in apps/web wires the driver).
export {
  type Notifier,
  type AuthMessage,
  getNotifier,
  setNotifier,
  consoleNotifier,
} from "./notifier";
export { createResendNotifier } from "./notifier-resend";

// Events
export type {
  AuthEvent,
  UserRegistered,
  UserVerified,
  UserLoggedIn,
  UserLoggedOut,
  PasswordReset,
} from "./events";
