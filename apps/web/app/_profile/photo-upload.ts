/**
 * What both photo pickers agree on: which image types are allowed, and what to
 * say when something else turns up. The click path is filtered by the file
 * dialog via `accept`; the drop path is not, so a dragged-in PDF has to be
 * rejected in code.
 */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/** Value for an `<input type="file">` `accept` attribute. */
export const ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(",");

/** `null` when the file may be uploaded, otherwise the message to show. */
export function acceptImageFile(file: { type: string }): string | null {
  return (ACCEPTED_IMAGE_TYPES as ReadonlyArray<string>).includes(file.type)
    ? null
    : "Nur JPEG, PNG, WebP oder AVIF.";
}
