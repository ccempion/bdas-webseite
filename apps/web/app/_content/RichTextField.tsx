"use client";

import Link from "@tiptap/extension-link";
import { EditorContent, useEditor, type Content, type Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { RICH_TEXT_STARTERKIT_CONFIG } from "./rich-text-config";

const EXTENSIONS = [
  StarterKit.configure(RICH_TEXT_STARTERKIT_CONFIG),
  Link.configure({ openOnClick: false, autolink: false }),
];

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

function ToolbarButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-bdas-sm border px-2 py-1 text-sm text-bdas-ink " +
        (active ? "border-bdas-strong bg-bdas-surface-hover" : "border-bdas-soft")
      }
    >
      {label}
    </button>
  );
}

/** Puck custom field: Tiptap WYSIWYG storing ProseMirror JSON (rendered by
 *  renderRichText). No HTML is ever produced. */
export function RichTextField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (doc: unknown) => void;
}) {
  const editor = useEditor({
    // Cast bridges the two @tiptap/core majors (app v2 / Puck v3); nominal-only.
    extensions: EXTENSIONS as Extensions,
    content: (value as Content) ?? EMPTY_DOC,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: {
      attributes: {
        class:
          "prose max-w-none min-h-[6rem] rounded-bdas border border-bdas-soft bg-bdas-surface p-3 focus:outline-none",
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <ToolbarButton
          active={editor.isActive("bold")}
          label="Fett"
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          active={editor.isActive("italic")}
          label="Kursiv"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          active={editor.isActive("bulletList")}
          label="Liste"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          active={editor.isActive("orderedList")}
          label="Nummeriert"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          active={editor.isActive("link")}
          label="Link"
          onClick={() => {
            const prev = (editor.getAttributes("link")["href"] as string | undefined) ?? "";
            const url = window.prompt("Link-URL (https://… oder /pfad)", prev);
            if (url === null) return;
            if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
            else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
