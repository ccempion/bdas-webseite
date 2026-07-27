/**
 * What may be uploaded, in one place. Both the client (before a drop leaves the
 * browser) and the `/api/**​/upload-url` routes (authoritatively) read these
 * specs, so a cap can no longer drift between the two.
 *
 * Framework-free and free of server-only imports: safe on both sides.
 */

export type AcceptSpec = {
  readonly mime: readonly string[];
  readonly maxBytes: number;
  readonly maxLabel: string;
};

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

/** A profile photo. */
export const PROFILE_IMAGE: AcceptSpec = {
  mime: IMAGE_MIME,
  maxBytes: 5 * 1024 * 1024,
  maxLabel: "5 MB",
};

/** Page, blog and event imagery all share one cap. */
export const CONTENT_IMAGE: AcceptSpec = {
  mime: IMAGE_MIME,
  maxBytes: 10 * 1024 * 1024,
  maxLabel: "10 MB",
};

/** For the `accept` attribute of a file input. */
export const IMAGE_ACCEPT = IMAGE_MIME.join(",");

export type Candidate = { readonly name: string; readonly type: string; readonly size: number };

/**
 * A drag carries files only when the DataTransfer advertises the "Files" kind,
 * so a zone does not light up for a drag it could never accept.
 */
export function dragHasFiles(types: readonly string[]): boolean {
  return types.includes("Files");
}

const isImageSpec = (spec: AcceptSpec): boolean =>
  spec.mime.length === IMAGE_MIME.length && IMAGE_MIME.every((m) => spec.mime.includes(m));

/** German reason this file may not be uploaded, or null when it is acceptable. */
export function rejectReason(file: Candidate, spec: AcceptSpec): string | null {
  if (!spec.mime.includes(file.type)) {
    return isImageSpec(spec)
      ? `${file.name}: nur JPEG, PNG, WebP oder AVIF.`
      : `${file.name}: Dateityp nicht erlaubt.`;
  }
  if (file.size <= 0 || file.size > spec.maxBytes) {
    return `${file.name}: größer als ${spec.maxLabel}.`;
  }
  return null;
}

/** The server-side wording, kept here so the cap and its message cannot drift. */
export function tooLargeMessage(spec: AcceptSpec): string {
  return `Datei zu groß (max. ${spec.maxLabel}).`;
}

/**
 * Split a drop into what may be uploaded and German messages for the rest.
 * With `firstOnly`, files past the first acceptable one are ignored silently:
 * dropping three photos on an avatar means "use one of these", not "you made
 * two mistakes".
 */
export function intakeFiles<T extends Candidate>(
  files: readonly T[],
  spec: AcceptSpec,
  opts: { readonly firstOnly?: boolean } = {},
): { readonly accepted: readonly T[]; readonly rejected: readonly string[] } {
  const accepted: T[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    if (opts.firstOnly && accepted.length === 1) break;
    const reason = rejectReason(file, spec);
    if (reason) {
      rejected.push(reason);
      continue;
    }
    accepted.push(file);
  }
  return { accepted, rejected };
}
