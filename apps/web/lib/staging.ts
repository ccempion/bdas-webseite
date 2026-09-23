/**
 * Staging = every Vercel preview deployment (ADR 0053). Previews run against
 * the separate staging Supabase project, so nothing they do reaches bdas.de —
 * except email, which would go to whatever address a tester typed in. This
 * file closes that gap and gives the UI a single "is this staging?" signal.
 */

export function isStaging(): boolean {
  return process.env["VERCEL_ENV"] === "preview";
}

type Addressed = { readonly to: string };
type Sender<T extends Addressed> = { send(message: T): Promise<void> };

/**
 * On staging, rewrites every recipient to `EMAIL_REDIRECT_TO` and tags the
 * subject (where the message has one) with the original address. Without a
 * redirect target, staging falls back to `fallback` (the console notifier) —
 * a missing env var must never mean real delivery. Outside staging it returns
 * `notifier` unchanged.
 */
export function stagingSafeNotifier<T extends Addressed>(
  notifier: Sender<T>,
  fallback: Sender<T>,
): Sender<T> {
  if (!isStaging()) return notifier;
  const target = process.env["EMAIL_REDIRECT_TO"]?.trim();
  if (!target) return fallback;
  return {
    async send(message: T): Promise<void> {
      const redirected: Addressed & { subject?: unknown } = { ...message, to: target };
      if (typeof redirected.subject === "string") {
        redirected.subject = `[Staging → ${message.to}] ${redirected.subject}`;
      }
      await notifier.send(redirected as T);
    },
  };
}

/** Checks a Basic-Auth header; the username part is ignored. */
export function hasStagingPassword(header: string | null, expected: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0));
    decoded = new TextDecoder().decode(bytes);
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator === -1) return false;
  return constantTimeEqual(decoded.slice(separator + 1), expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < y.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
