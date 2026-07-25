import React from "react";

import { Card } from "@bdas/design-system";

import { isExternalHref, safeHref } from "./href";
import { buildTree, type Kasten, type OrgNode } from "./org-tree";

/** A single box. An unsafe or empty href renders unlinked rather than
 *  dropping the box, so bad input never loses content. */
function Kachel({ kasten }: { kasten: Kasten }) {
  const href = safeHref(kasten.link);
  const extern = href !== null && isExternalHref(href);

  const inhalt = (
    <Card
      className={`w-48 px-4 py-3 text-center ${
        // The design system's accent idiom (CLAUDE.md §7): left border + halo,
        // as on an open accordion. A side-specific border colour also avoids
        // colliding with Card's own all-sides `border-bdas-soft`.
        kasten.hervorheben ? "border-l-4 border-l-bdas-red shadow-bdas-red-glow" : ""
      }`}
    >
      {kasten.logo ? (
        <img
          src={kasten.logo}
          alt=""
          aria-hidden
          className="mx-auto mb-2 h-10 w-auto object-contain"
        />
      ) : null}
      <p className="font-semibold text-bdas-ink">
        {kasten.titel}
        {extern ? <span aria-hidden> ↗</span> : null}
      </p>
      {kasten.untertitel ? (
        <p className="mt-1 text-sm text-bdas-ink-body">{kasten.untertitel}</p>
      ) : null}
    </Card>
  );

  if (href === null) return inhalt;

  return (
    <a
      href={href}
      className="block no-underline"
      {...(extern ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {inhalt}
    </a>
  );
}

function Knoten({ node }: { node: OrgNode }) {
  return (
    <li>
      <Kachel kasten={node.kasten} />
      {node.kinder.length > 0 ? (
        <ul>
          {node.kinder.map((kind, i) => (
            <Knoten key={i} node={kind} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Connectors are drawn by `.bdas-organigramm` rules in globals.css, which key
 *  off `li > ul` — so the root list gets no incoming line. */
export function Organigramm({ kaesten }: { kaesten: Kasten[] }) {
  const wurzeln = buildTree(kaesten);
  if (wurzeln.length === 0) return null;

  return (
    // pt-1: overflow-x:auto makes overflow-y compute to auto too, so the root
    // card's hover:-translate-y-0.5 lift would clip against the flush top edge.
    <div className="bdas-organigramm overflow-x-auto pt-1">
      <ul>
        {wurzeln.map((wurzel, i) => (
          <Knoten key={i} node={wurzel} />
        ))}
      </ul>
    </div>
  );
}
