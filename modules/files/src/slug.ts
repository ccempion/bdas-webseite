/**
 * Folder name -> URL-safe slug. German-aware: umlauts transliterate the way a
 * German reader expects (ü -> ue, not u), so "Beschlüsse" reads as
 * "beschluesse" rather than "beschlsse".
 */
const TRANSLITERATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

const MAX_SLUG_LENGTH = 60;

export function slugifyFolderName(name: string): string {
  let s = name.normalize("NFC").toLowerCase();
  for (const [pattern, replacement] of TRANSLITERATIONS) {
    s = s.replace(pattern, replacement);
  }
  s = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (s.length > MAX_SLUG_LENGTH) {
    s = s.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  }
  return s === "" ? "ordner" : s;
}
