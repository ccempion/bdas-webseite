/**
 * Next.js startup hook (App Router). Runs once per server process before any
 * request is served. We boot the notifications module here so its bus
 * subscribers are wired regardless of which route warms the instance first
 * (review finding 1). The Edge runtime cannot run the DB/notifier stack, so we
 * gate on the Node runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootNotifications } = await import("./lib/notifications-bootstrap");
    // A throw here (flag-on production with partial Resend config) intentionally
    // crashes startup, surfacing the misconfig before any request is served.
    bootNotifications();
  }
}
