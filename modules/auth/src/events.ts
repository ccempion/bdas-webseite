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

export type AuthEvent =
  | UserRegistered
  | UserVerified
  | UserLoggedIn
  | UserLoggedOut
  | PasswordReset;
