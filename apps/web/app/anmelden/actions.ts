"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { login } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { isFlagOn, requireFlag } from "@bdas/feature-flags";
import { getMemberByUserId } from "@bdas/members";

import { bootAuth } from "../../lib/auth-bootstrap";
import { setSessionCookie } from "../../lib/auth-cookie";
import { isProfileComplete } from "../_profile/complete";

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

  // Guide pending members who verified but never finished onboarding straight
  // into the wizard; everyone else (incl. active members with missing profile
  // data, who backfill via /account) lands on their account.
  if (isFlagOn("profile")) {
    const db = getDb();
    const member = await getMemberByUserId(db, result.userId);
    if (member?.status === "pending" && !(await isProfileComplete(db, result.userId))) {
      redirect("/profil");
    }
  }
  redirect("/account");
}
