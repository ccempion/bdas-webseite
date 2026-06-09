"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { login } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";

import { bootAuth } from "../../lib/auth-bootstrap";
import { setSessionCookie } from "../../lib/auth-cookie";
import { bootNotifications } from "../../lib/notifications-bootstrap";

export type LoginFormState = {
  readonly error?: string;
  readonly needsVerification?: boolean;
};

export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  requireFlag("auth");
  bootAuth();
  bootNotifications();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "0.0.0.0";
  const userAgent = h.get("user-agent") ?? undefined;

  let result;
  try {
    result = await login(
      getDb(),
      { email, password },
      { ip, ...(userAgent !== undefined ? { userAgent } : {}) },
    );
  } catch (err) {
    if (isAppError(err)) {
      const needsVerification = err.message.includes("E-Mail-Adresse");
      return { error: err.message, ...(needsVerification ? { needsVerification: true } : {}) };
    }
    throw err;
  }

  setSessionCookie(result.token);
  redirect("/account");
}
