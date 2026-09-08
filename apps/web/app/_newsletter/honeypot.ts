/**
 * A field that is invisible to people and irresistible to naive bots (spec §8
 * no. 2). Named like a real field on purpose — "honeypot" would give it away.
 *
 * It lives here rather than next to the action because a `"use server"` module
 * may only export async functions; a plain constant there fails the build.
 */
export const HONEYPOT_FIELD = "website";
