/**
 * Central, reusable access + identity resolution for blog surfaces.
 *
 * Every blog page, action and route imports its checks from here — the
 * role/rights logic is defined once (spec: "Rollen-/Rechteprüfung zentral").
 * The pure rules live in @bdas/blog (`visibility.ts`); this module only maps the
 * session principal onto them and resolves author display data via @bdas/members.
 */
import { cache } from "react";
import { redirect } from "next/navigation";

import { ANON, canModeratePost, type Post, type Viewer } from "@bdas/blog";
import { getDb } from "@bdas/db";
import {
  getMemberByUserId,
  getCurrentMember,
  isFederalBoard,
  type CurrentMember,
} from "@bdas/members";
import { getProfile } from "@bdas/profile";

import { readSessionCookie } from "../../lib/auth-cookie";
import { signedProfilePhotoUrl } from "../_profile/photo-url";

/** Current principal, deduped per request. */
export const loadBlogMe = cache(
  (): Promise<CurrentMember | null> => getCurrentMember(getDb(), readSessionCookie()),
);

/** Map the session principal onto the blog visibility `Viewer`. */
export function blogViewer(me: CurrentMember | null): Viewer {
  if (!me) return ANON;
  return {
    userId: me.user.id,
    isMember: me.member?.status === "active",
    isFederal: isFederalBoard(me.grants),
  };
}

/** Load `{ me, viewer }` in one shot for a read surface. */
export async function loadBlogViewer(): Promise<{ me: CurrentMember | null; viewer: Viewer }> {
  const me = await loadBlogMe();
  return { me, viewer: blogViewer(me) };
}

/** Eligible to author a post: an active member or an alumnus. Pending (not yet
 *  confirmed by a Local Board) and inactive accounts cannot (ADR 0030). */
export function canAuthor(me: CurrentMember | null): boolean {
  return me !== null && (me.member?.status === "active" || me.member?.status === "alumnus");
}

/** Any eligible (active member or alumnus) user may author a post. Otherwise → login/blog. */
export async function requirePostAuthor(): Promise<CurrentMember> {
  const me = await loadBlogMe();
  if (!me) redirect("/anmelden");
  if (!canAuthor(me)) redirect("/blog");
  return me;
}

/** Author or federal board may edit/delete. */
export function canModerate(me: CurrentMember | null, post: Post): boolean {
  return canModeratePost(blogViewer(me), post);
}

export type AuthorDisplay = {
  readonly name: string;
  readonly initials: string;
  /** Short-lived signed URL for the profile photo, or null (no photo / not shown). */
  readonly photoUrl: string | null;
};

const FALLBACK: AuthorDisplay = { name: "BDAS-Mitglied", initials: "?", photoUrl: null };

function displayFrom(first: string, last: string, photoUrl: string | null): AuthorDisplay {
  const name = `${first} ${last}`.trim() || FALLBACK.name;
  const initials = `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || FALLBACK.initials;
  return { name, initials, photoUrl };
}

/**
 * Profile photos are personal data in a private bucket (spec §7). The blog feed
 * is also readable signed-out, so the photo is resolved for signed-in viewers
 * only — a visitor off the street gets the initials chip.
 */
async function authorPhotoUrl(userId: string, withPhoto: boolean): Promise<string | null> {
  if (!withPhoto) return null;
  const profile = await getProfile(getDb(), userId);
  return signedProfilePhotoUrl(profile?.photoStorageKey);
}

/** Resolve one author's display name/initials/photo (auth user id → member + profile). */
export async function resolveAuthor(userId: string, withPhoto = false): Promise<AuthorDisplay> {
  const [member, photoUrl] = await Promise.all([
    getMemberByUserId(getDb(), userId),
    authorPhotoUrl(userId, withPhoto),
  ]);
  if (!member) return { ...FALLBACK, photoUrl };
  return displayFrom(member.firstName, member.lastName, photoUrl);
}

/** Batch-resolve author displays for a feed, one lookup per unique author. */
export async function resolveAuthors(
  userIds: ReadonlyArray<string>,
  withPhotos = false,
): Promise<Map<string, AuthorDisplay>> {
  const unique = [...new Set(userIds)];
  const entries = await Promise.all(
    unique.map(async (id) => [id, await resolveAuthor(id, withPhotos)] as const),
  );
  return new Map(entries);
}
