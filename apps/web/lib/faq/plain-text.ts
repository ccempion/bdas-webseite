/**
 * Recursively collects every `text` field out of a Tiptap document (or any
 * plain-object tree shaped like one), joins them with a single space, and
 * collapses whitespace. Used to build the search-text index for an entry —
 * the document itself is never rendered here, only walked.
 */
export function plainText(doc: unknown): string {
  const parts: string[] = [];
  collect(doc, parts);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function collect(node: unknown, parts: string[]): void {
  if (node === null || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) collect(item, parts);
    return;
  }

  const record = node as Record<string, unknown>;
  if (typeof record.text === "string" && record.text.length > 0) {
    parts.push(record.text);
  }
  if (Array.isArray(record.content)) {
    for (const child of record.content) collect(child, parts);
  }
}
