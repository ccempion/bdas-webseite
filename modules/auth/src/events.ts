/**
 * Events emitted by the auth module. Other modules subscribe via core/events.
 * Consumers depend on these types, not on the producing services.
 */

export type UserRegistered = {
  readonly type: "auth.user.registered";
  readonly userId: string;
  readonly email: string;
  readonly at: Date;
};

export type UserVerified = {
  readonly type: "auth.user.verified";
  readonly userId: string;
  readonly email: string;
  readonly at: Date;
};

export type UserLoggedIn = {
  readonly type: "auth.user.logged_in";
  readonly userId: string;
  readonly sessionId: string;
  readonly at: Date;
};

export type UserLoggedOut = {
  readonly type: "auth.user.logged_out";
  readonly userId: string;
  readonly sessionId: string;
  readonly at: Date;
};

export type PasswordReset = {
  readonly type: "auth.password.reset";
  readonly userId: string;
  readonly at: Date;
};

/**
 * A signed-in user chose a new password. Deliberately distinct from
 * PasswordReset — "I changed it" and "I had lost it" are different signals.
 */
export type PasswordChanged = {
  readonly type: "auth.password.changed";
  readonly userId: string;
  readonly at: Date;
};

/**
 * A signed-in user's login email was confirmed via the link mailed to the
 * new address. `oldEmail` lets subscribers (e.g. members) keep their own
 * denormalized copies in sync.
 */
export type EmailChanged = {
  readonly type: "auth.email.changed";
  readonly userId: string;
  readonly oldEmail: string;
  readonly newEmail: string;
  readonly at: Date;
};

/**
 * An identity was erased (ADR 0044). The row is already gone when this fires;
 * `email` is the normalized address it had, for modules that match on it.
 */
export type UserDeleted = {
  readonly type: "auth.user.deleted";
  readonly userId: string;
  readonly email: string;
  readonly at: Date;
};

/**
 * A signed-in user asked to delete their account (DSGVO Art. 17). The
 * account is already locked and its sessions revoked when this fires; the
 * hard purge itself follows `scheduledPurgeAt`, handled by a later PR's
 * cron sweep, not by a subscriber to this event (spec §2 decision 1).
 */
export type AccountDeletionRequested = {
  readonly type: "auth.account_deletion.requested";
  readonly userId: string;
  readonly requestId: string;
  readonly scheduledPurgeAt: Date;
  readonly at: Date;
};

/** The user (or a reactivation link) cancelled a pending deletion in time. */
export type AccountDeletionCancelled = {
  readonly type: "auth.account_deletion.cancelled";
  readonly userId: string;
  readonly requestId: string;
  readonly at: Date;
};

export type AuthEvent =
  | UserRegistered
  | UserVerified
  | UserLoggedIn
  | UserLoggedOut
  | PasswordReset
  | PasswordChanged
  | EmailChanged
  | UserDeleted
  | AccountDeletionRequested
  | AccountDeletionCancelled;
