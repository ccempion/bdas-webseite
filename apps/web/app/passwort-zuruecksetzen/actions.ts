"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  buildResetUrl,
  completePasswordReset,
  getNotifier,
  requestPasswordReset,
} from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";

import { bootAuth } from "../../lib/auth-bootstrap";

export type RequestResetState = {
  readonly error?: string;
  readonly sent?: true;
};

export async function requestResetAction(
  _prev: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  requireFlag("auth");
  bootAuth();

  const email = String(formData.get("email") ?? "");
  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "0.0.0.0";

  try {
    const result = await requestPasswordReset(getDb(), { email }, { ip });
    if (result) {
      const url = buildResetUrl(
        process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
        result.resetToken,
      );
      try {
        await getNotifier().send({ kind: "reset", to: email, resetUrl: url });
      } catch (err) {
        console.error("[auth] reset email send failed:", err);
      }
    }
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  // Always report "sent" — never reveal whether the email is registered.
  return { sent: true };
}

export type CompleteResetState = {
  readonly error?: string;
};

export async function completeResetAction(
  _prev: CompleteResetState,
  formData: FormData,
): Promise<CompleteResetState> {
  requireFlag("auth");
  bootAuth();

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await completePasswordReset(getDb(), { token, password });
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  redirect("/anmelden");
}
