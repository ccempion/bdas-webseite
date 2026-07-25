/** One authored box. The board writes a flat outline; `ebene` carries the
 *  nesting the way indentation does in a word processor. */
export type Kasten = {
  ebene: "1" | "2" | "3" | "4";
  titel: string;
  untertitel: string;
  link: string;
  logo: string;
  hervorheben: boolean;
};

export type OrgNode = { kasten: Kasten; kinder: OrgNode[] };

/**
 * Turn the flat outline into a tree: each row attaches to the nearest
 * preceding row one or more levels shallower. Malformed input is never
 * dropped — a leading deep row becomes a root, and a skipped level attaches
 * to the nearest shallower ancestor.
 */
export function buildTree(kaesten: Kasten[]): OrgNode[] {
  const roots: OrgNode[] = [];
  const stack: { level: number; node: OrgNode }[] = [];

  for (const kasten of kaesten) {
    const level = Number(kasten.ebene);
    const node: OrgNode = { kasten, kinder: [] };

    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();

    const parent = stack[stack.length - 1];
    if (parent) parent.node.kinder.push(node);
    else roots.push(node);

    stack.push({ level, node });
  }

  return roots;
}
