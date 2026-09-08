import { getDb } from "@bdas/db";
import { getSubscriptionForUser } from "@bdas/newsletter";

import { subscribeMeAction, unsubscribeMeAction } from "./actions";

/**
 * `<form action>` in a server component takes the plain `(formData)` shape,
 * while the actions carry the `useActionState` shape that the client-side C1
 * banner needs. These two adapt one to the other so the switch stays
 * JavaScript-free: the page simply re-renders.
 */
async function subscribeFromToggle(formData: FormData): Promise<void> {
  "use server";
  await subscribeMeAction({}, formData);
}

async function unsubscribeFromToggle(formData: FormData): Promise<void> {
  "use server";
  await unsubscribeMeAction({}, formData);
}

/**
 * B1 — one row with a switch inside the existing settings card.
 *
 * The only surface in the platform that can turn the newsletter OFF
 * (spec §3.4). A server component: the switch posts a Server Action and the
 * page re-renders, so no client state is needed.
 */
export async function NewsletterToggle({ userId }: { userId: string }) {
  const sub = await getSubscriptionForUser(getDb(), userId);
  const on = sub?.status === "subscribed";
  const pending = sub?.status === "pending";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bdas-soft pt-4 first:border-0 first:pt-0">
      <div>
        <p id="newsletter-switch-label" className="font-medium text-bdas-ink">
          Newsletter
        </p>
        <p className="text-sm text-bdas-ink-body">
          {pending
            ? "Fast geschafft — bestätige noch den Link in deiner E-Mail."
            : "Ein paar Mal im Jahr: was im Verband ansteht und was wir vorhaben."}
        </p>
      </div>

      <form action={on ? unsubscribeFromToggle : subscribeFromToggle}>
        <input type="hidden" name="source" value="konto" />
        <input type="hidden" name="sourcePath" value="/account/einstellungen" />
        <button
          type="submit"
          role="switch"
          aria-checked={on}
          aria-labelledby="newsletter-switch-label"
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-bdas-full
            transition-colors duration-bdas-quick ease-bdas
            focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-red/40
            ${on ? "bg-bdas-red" : "bg-bdas-overlay-hover"}`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-bdas-full bg-bdas-surface shadow-bdas-card
              transition-transform duration-bdas-quick ease-bdas
              ${on ? "translate-x-[22px]" : "translate-x-[2px]"}`}
          />
        </button>
      </form>
    </div>
  );
}
