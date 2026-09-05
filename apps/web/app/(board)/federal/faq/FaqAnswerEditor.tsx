"use client";

import { EditorContent, useEditor, type Content } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

import type { TiptapDoc } from "@bdas/faq";

const BTN =
  "rounded-bdas-sm px-2 py-1 text-sm text-bdas-ink-body hover:bg-bdas-overlay-hover " +
  "transition-colors duration-bdas-quick ease-bdas data-[active=true]:bg-bdas-overlay-soft";

/** Eingeschränktes Set (Spec §3): fett/kursiv/Zwischenüberschriften/Listen/
 *  Links — kein Bild, kein Upload, anders als das Events-Pendant. */
export function FaqAnswerEditor({
  value,
  onChange,
}: {
  value: TiptapDoc;
  onChange: (doc: TiptapDoc) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ underline: false, link: { openOnClick: false } })],
    content: value as Content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as TiptapDoc),
    editorProps: {
      attributes: {
        class:
          "prose max-w-none min-h-[8rem] rounded-bdas border border-bdas-soft bg-bdas-surface " +
          "px-3 py-2.5 focus:border-bdas-red focus:outline-none",
      },
    },
  });

  // Reopening the dialog for a different entry must reset the editor's own
  // internal state — Tiptap does not re-derive content from a changed `content`
  // prop after first mount.
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(value)) {
      editor.commands.setContent(value as Content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on identity change of the doc, not every keystroke
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1 border-b border-bdas-soft pb-2">
        <button
          type="button"
          className={BTN}
          data-active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          Fett
        </button>
        <button
          type="button"
          className={BTN}
          data-active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          Kursiv
        </button>
        <button
          type="button"
          className={BTN}
          data-active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>
        <button
          type="button"
          className={BTN}
          data-active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </button>
        <button
          type="button"
          className={BTN}
          data-active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Liste
        </button>
        <button
          type="button"
          className={BTN}
          onClick={() => {
            const url = window.prompt("Link-URL (https://…)") ?? "";
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
        >
          Link
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
