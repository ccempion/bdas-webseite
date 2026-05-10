"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { buildVerifyUrl, getNotifier, register } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError, ValidationError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";

import { bootAuth } from "../../lib/auth-bootstrap";

export type RegisterFormState = {
  readonly error?: string;
  readonly fields?: Record<string, string>;
};

export async function registerAction(
  _prev: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  requireFlag("auth");
  bootAuth();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = clientIp();

  let result;
  try {
    result = await register(
      getDb(),
      { email, password },
      {
        ip,
        publicSiteUrl: process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
      },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return err.fields ? { error: err.message, fields: err.fields } : { error: err.message };
    }
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  const verifyUrl = buildVerifyUrl(
    process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
    result.verifyToken,
  );
  await getNotifier().send({ kind: "verify", to: email, verifyUrl });

  redirect("/registrieren/erfolg");
}

function clientIp(): string {
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "0.0.0.0";
}
