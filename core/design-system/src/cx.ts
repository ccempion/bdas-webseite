/** Tiny class-name joiner. Falsy entries are dropped. Avoids a `clsx` dep. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p)).join(" ");
}
