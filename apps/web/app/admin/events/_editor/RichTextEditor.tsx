"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor, type Content } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useState } from "react";

import type { TiptapDoc } from "@bdas/events-module";

const BTN =
  "rounded-bdas-sm px-2 py-1 text-sm text-bdas-ink-body hover:bg-bdas-overlay-hover " +
  "transition-colors duration-bdas-quick ease-bdas data-[active=true]:bg-bdas-overlay-soft";

export function RichTextEditor({
  name,
  defaultDoc,
  eventId,
}: {
  name: string;
  defaultDoc: TiptapDoc | null;
  eventId: string;
}) {
  const [json, setJson] = useState<string>(defaultDoc ? JSON.stringify(defaultDoc) : "");
  const editor = useEditor({
    extensions: [StarterKit, Image, Link.configure({ openOnClick: false })],
    content: (defaultDoc ?? "") as Content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => setJson(JSON.stringify(editor.getJSON())),
    editorProps: {
      attributes: {
        class:
          "prose max-w-none min-h-[8rem] rounded-bdas border border-bdas-soft bg-bdas-surface " +
          "px-3 py-2.5 focus:border-bdas-red focus:outline-none",
      },
    },
  });

  const addImage = useCallback(async () => {
    if (!editor) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const res = await fetch(`/api/events/${eventId}/upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Upload fehlgeschlagen." }));
        alert(error ?? "Upload fehlgeschlagen.");
        return;
      }
      const { uploadUrl, publicUrl } = await res.json();
      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) {
        alert("Upload fehlgeschlagen.");
        return;
      }
      editor.chain().focus().setImage({ src: publicUrl }).run();
    };
    input.click();
  }, [editor, eventId]);

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={json} />
      <div className="flex flex-wrap gap-1 border-b border-bdas-soft pb-2">
        <button type="button" className={BTN} data-active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}>Fett</button>
        <button type="button" className={BTN} data-active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}>Kursiv</button>
        <button type="button" className={BTN} data-active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" className={BTN} data-active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
        <button type="button" className={BTN} data-active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}>Liste</button>
        <button type="button" className={BTN}
          onClick={() => {
            const url = window.prompt("Link-URL (https://…)") ?? "";
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}>Link</button>
        <button type="button" className={BTN} onClick={addImage}>Bild</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
