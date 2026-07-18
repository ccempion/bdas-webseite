/**
 * Editor-side allow-set: StarterKit nodes/marks disabled for Fließtext because
 * headings, quotes and dividers are their own Puck blocks. Kept dependency-free
 * so it is unit-testable in the node test env. The render side (rich-text.tsx)
 * allow-lists on top of this — defence in depth.
 */
export const RICH_TEXT_STARTERKIT_CONFIG = {
  heading: false,
  blockquote: false,
  code: false,
  codeBlock: false,
  horizontalRule: false,
  strike: false,
} as const;
