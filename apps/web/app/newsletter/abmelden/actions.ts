"use server";

import { headers } from "next/headers";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { unsubscribeByToken } from "@bdas/newsletter";

import { bootNewsletter } from "../../../lib/newsletter-bootstrap";
import { newsletterEnabled } from "../../_newsletter/flag";

export type UnsubscribeState = { readonly ok?: boolean; readonly error?: string };

export async function unsubscribeByTokenAction(
  _prev: UnsubscribeState,
  formData: FormData,
): Promise<UnsubscribeState> {
  if (!newsletterEnabled()) return { error: "Das hat gerade nicht geklappt." };
  bootNewsletter();

  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "Dieser Abmeldelink ist unvollständig." };

  const h = headers();
  try {
    await unsubscribeByToken(getDb(), token, {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    });
  } catch (err) {
    // NotFoundError means the link is not ours. Anything else is our problem.
    if (isAppError(err)) return { error: "Dieser Abmeldelink ist nicht mehr gültig." };
    console.error("[newsletter] unsubscribe by token failed:", err);
    return { error: "Das hat gerade nicht geklappt. Versuch es bitte noch einmal." };
  }

  return { ok: true };
}
