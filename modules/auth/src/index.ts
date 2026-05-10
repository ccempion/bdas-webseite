/**
 * @bdas/auth — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only the symbols re-exported here are visible to
 * other workspaces. Internal files are not importable across the boundary.
 */

// Services
export {
  register,
  RegisterInput,
  buildVerifyUrl,
  type RegisterResult,
} from "./services/register.js";
export { verifyEmail, type VerifyResult } from "./services/verify.js";
export { login, LoginInput, type LoginResult, type LoginContext } from "./services/login.js";
export { logout } from "./services/logout.js";
export {
  requestPasswordReset,
  completePasswordReset,
  buildResetUrl,
  ResetRequestInput,
  ResetCompleteInput,
} from "./services/password-reset.js";
export { getCurrentUser, requireRole, type CurrentUser } from "./services/me.js";

// SSO + cookie
export {
  COOKIE_NAME,
  COOKIE_MAX_AGE_SECONDS,
  TOKEN_VERSION,
  type Role,
  type SsoClaims,
} from "./sso.js";

// Notifier (composition root in apps/web wires the driver).
export {
  type Notifier,
  type AuthMessage,
  getNotifier,
  setNotifier,
  consoleNotifier,
} from "./notifier.js";
export { createResendNotifier } from "./notifier-resend.js";

// Events
export type {
  AuthEvent,
  UserRegistered,
  UserVerified,
  UserLoggedIn,
  UserLoggedOut,
  PasswordReset,
} from "./events.js";
