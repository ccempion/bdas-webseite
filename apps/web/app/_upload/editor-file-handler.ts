/**
 * Drop and paste images into a Tiptap document. The drop/paste plumbing —
 * intercepting the event, resolving the drop position — is Tiptap's own
 * `FileHandler` extension; this only decides what is acceptable and what to do
 * with the bytes.
 *
 * `allowedMimeTypes` is deliberately not passed: it filters silently, so a
 * dropped PDF would vanish with no explanation. `intakeFiles` gives the same
 * German messages every other upload surface gives, and enforces the size cap,
 * which `allowedMimeTypes` does not.
 */
// Types come via @tiptap/react (which re-exports @tiptap/core) so this file
// needs no direct dependency on core beyond what the editors already pull in.
import { FileHandler } from "@tiptap/extension-file-handler";
import type { Editor, Extension } from "@tiptap/react";

import { CONTENT_IMAGE, intakeFiles } from "./accept";
import { uploadImage } from "./upload-image";

async function insert(
  editor: Editor,
  endpoint: string,
  files: readonly File[],
  onError: (message: string) => void,
  pos: number | null,
  extra?: Record<string, unknown>,
): Promise<void> {
  let at = pos;
  for (const file of files) {
    const out = await uploadImage<{ uploadUrl: string; publicUrl: string }>(endpoint, file, extra);
    if ("error" in out) {
      onError(out.error);
      continue;
    }
    const image = { type: "image", attrs: { src: out.ok.publicUrl } };
    if (at === null) editor.chain().focus().insertContent(image).run();
    else editor.chain().focus().insertContentAt(at, image).run();
    // Subsequent images in the same drop go after the one just inserted.
    if (at !== null) at = editor.state.selection.to;
  }
}

export function imageFileHandler(opts: {
  endpoint: string;
  onError: (message: string) => void;
  /** Extra fields for the signing request. The content route authorizes a
   *  group lead by the `slug` it finds here; without it the request reads as a
   *  federal page and a lead is rejected. The blog route needs none. */
  extra?: Record<string, unknown>;
}): Extension {
  const take = (files: File[]): readonly File[] => {
    const { accepted, rejected } = intakeFiles(files, CONTENT_IMAGE);
    if (rejected.length > 0) opts.onError(rejected.join("\n"));
    return accepted;
  };

  return FileHandler.configure({
    // Without this, pasting a screenshot copied from a web page inserts both
    // the upload and the clipboard's own HTML <img>.
    consumePasteEvent: true,
    onDrop: (editor, files, pos) => {
      const accepted = take(files);
      if (accepted.length > 0)
        void insert(editor, opts.endpoint, accepted, opts.onError, pos, opts.extra);
    },
    onPaste: (editor, files) => {
      const accepted = take(files);
      if (accepted.length > 0)
        void insert(editor, opts.endpoint, accepted, opts.onError, null, opts.extra);
    },
  });
}
