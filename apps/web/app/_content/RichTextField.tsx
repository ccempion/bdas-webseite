"use client";

import React, { useContext, useMemo } from "react";

import Image from "@tiptap/extension-image";
import { EditorContent, useEditor, type Content } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { imageFileHandler } from "../_upload/editor-file-handler";
import { BILD_BREITE_STUFEN } from "./bild-breite";
import { ContentSlugContext } from "./content-slug-context";
import type { Umfluss } from "./rich-text";
import { RICH_TEXT_STARTERKIT_CONFIG } from "./rich-text-config";

/** Tiptap's Image, taught the three attributes `rich-text.tsx` renders from.
 *  `breite` is a number on the shared scale — deliberately not the blog's
 *  `"50%"` string, so both content-page surfaces read one lookup. */
const InhaltsBild = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      breite: { default: 100 },
      umfluss: { default: "keine" },
      alt: { default: "" },
    };
  },
});

const UMFLUSS_WAHL: ReadonlyArray<{ wert: Umfluss; label: string }> = [
  { wert: "keine", label: "Kein Umfluss" },
  // The label names where the *text* goes, which is what the author is
  // choosing; `links` floats the image left and the text lands on its right.
  { wert: "links", label: "Text rechts" },
  { wert: "rechts", label: "Text links" },
];

// StarterKit v3 bundles Link and Underline; configure Link through it rather
// than adding a second instance. Underline stays off — it was not available
// under v2 and the migration does not change what authors can produce.
//
// Built per-slug rather than once at module scope: the signing route reads the
// content slug to authorize a group lead, so the file handler has to close over
// it. See `content-slug-context.ts`.
function extensionsFor(slug: string) {
  return [
    StarterKit.configure({
      ...RICH_TEXT_STARTERKIT_CONFIG,
      underline: false,
      link: { openOnClick: false, autolink: false },
    }),
    InhaltsBild,
    imageFileHandler({
      endpoint: "/api/content/upload-url",
      onError: (m) => window.alert(m),
      extra: { slug },
    }),
  ];
}

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
  const slug = useContext(ContentSlugContext);
  // Memoized so a re-render does not hand useEditor a fresh extension array.
  const extensions = useMemo(() => extensionsFor(slug), [slug]);
  const editor = useEditor({
    extensions,
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
        <ToolbarButton
          active={false}
          label="Bild"
          onClick={() => {
            const url = window.prompt("Bild-URL (https://…)") ?? "";
            if (url) editor.chain().focus().setImage({ src: url }).run();
          }}
        />
        {editor.isActive("image") ? (
          <>
            <span className="self-center px-1 text-xs text-bdas-ink-muted">Bildbreite:</span>
            {BILD_BREITE_STUFEN.map((stufe) => (
              <ToolbarButton
                key={stufe}
                active={editor.getAttributes("image")["breite"] === stufe}
                label={`${stufe} %`}
                onClick={() =>
                  editor.chain().focus().updateAttributes("image", { breite: stufe }).run()
                }
              />
            ))}
            <span className="self-center px-1 text-xs text-bdas-ink-muted">Textumfluss:</span>
            {UMFLUSS_WAHL.map(({ wert, label }) => (
              <ToolbarButton
                key={wert}
                active={editor.getAttributes("image")["umfluss"] === wert}
                label={label}
                onClick={() =>
                  editor.chain().focus().updateAttributes("image", { umfluss: wert }).run()
                }
              />
            ))}
            <input
              aria-label="Alt-Text (Barrierefreiheit)"
              placeholder="Alt-Text (Barrierefreiheit)"
              value={(editor.getAttributes("image")["alt"] as string | undefined) ?? ""}
              onChange={(e) =>
                editor.chain().focus().updateAttributes("image", { alt: e.target.value }).run()
              }
              className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-sm text-bdas-ink"
            />
          </>
        ) : null}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
