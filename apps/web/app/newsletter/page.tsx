import { requireNewsletterFlag } from "../_newsletter/flag";
import { NewsletterSignupForm } from "../_newsletter/NewsletterSignupForm";

export const metadata = {
  title: "Newsletter",
  description: "Ein paar Mal im Jahr Neues aus dem Bundesverband und den Hochschulgruppen.",
};

/**
 * The page exists mostly as a target for the Instagram and LinkedIn bios, both
 * of which are linked in the footer (spec §6).
 */
export default function NewsletterPage() {
  requireNewsletterFlag();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Newsletter</h1>
      <p className="text-bdas-ink-body">
        Veranstaltungen, Förderfristen und Neues aus den Hochschulgruppen — ein paar Mal im Jahr,
        nicht öfter.
      </p>
      <NewsletterSignupForm source="landingpage" sourcePath="/newsletter" variant="brand" />
    </main>
  );
}
