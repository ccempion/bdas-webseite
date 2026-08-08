import { z } from "zod";

/**
 * A group's public link fields end up as `<a href>` on `/gruppen/<slug>`.
 * `z.string().url()` alone is not enough: it delegates to `new URL()`, which
 * accepts `javascript:` and `data:`, and React 18 renders such an href with
 * nothing but a console warning — i.e. stored XSS written by whoever may edit
 * the group. Pin the scheme here, in the module, so every writer inherits the
 * check rather than each form re-implementing it.
 */
export const HttpUrlInput = z
  .string()
  .url("Ungültige Adresse")
  .max(500, "URL ist zu lang")
  .refine((v) => {
    try {
      const { protocol } = new URL(v);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Nur http- oder https-Adressen sind erlaubt");
