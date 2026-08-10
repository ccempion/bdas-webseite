import { type Config, type Data } from "@puckeditor/core";
import React from "react";

import { Card } from "@bdas/design-system";

import { FotoField } from "./FotoField";
import { Organigramm } from "./Organigramm";
import type { Kasten } from "./org-tree";
import { RichTextField } from "./RichTextField";
import { istLeererRichText, renderRichText } from "./rich-text";
import { isExternalHref, safeHref } from "./href";
import { BlockPlatzhalter } from "./BlockPlatzhalter";

type Person = {
  foto: string;
  name: string;
  rolle: string;
  uni: string;
  studiengang: string;
};

type Blocks = {
  Ueberschrift: { text: string; ebene: "h2" | "h3" };
  Absatz: { text: string };
  PersonenRaster: { personen: Person[] };
  Fliesstext: {
    inhalt: unknown;
  };
  Bild: {
    bild: string;
    altText: string;
    bildunterschrift: string;
    breite: "voll" | "halb";
  };
  Button: {
    label: string;
    href: string;
    variante: "primaer" | "sekundaer";
  };
  Zitat: {
    text: string;
    quelle: string;
  };
  Trenner: Record<string, never>;
  Abstand: {
    hoehe: "klein" | "mittel" | "gross";
  };
  Spalten: {
    anzahl: "2" | "3";
  };
  Organigramm: { kaesten: Kasten[] };
};

/** Content-column width. Carried on the page's root so the same value frames
 *  the blocks in the editor preview (`<Puck>`) and the public page (`<Render>`).
 *  `breit` gives the person grid room; text pages stay at reading width. */
export type Breite = "schmal" | "breit";

export const breiteClass = (breite: Breite): string =>
  breite === "breit" ? "max-w-5xl" : "max-w-3xl";

/** Ensure a document carries a `breite` before it reaches `<Puck>`/`<Render>`.
 *  Documents authored before the root existed have none; fall back per page so
 *  the editor and the published page frame them identically. */
export function withBreite(data: Data, fallback: Breite): Data {
  const props = (data.root?.props ?? {}) as Record<string, unknown>;
  if (props.breite === "schmal" || props.breite === "breit") return data;
  return { ...data, root: { ...data.root, props: { ...props, breite: fallback } } } as Data;
}

/**
 * Block palette for board-editable pages (spec §4). Deliberately small —
 * every extra block is maintenance. No raw-HTML block, ever: text renders
 * React-escaped, which is the structural XSS exclusion the spec relies on.
 *
 * `root.render` supplies the page container (centered column, width, block
 * spacing) so the editor preview matches the published page — without it, the
 * layout lives only in the route's `<main>` and the editor renders full-bleed.
 */
export const puckConfig: Config<Blocks> = {
  // `breite` is carried on root.props (seeded by withBreite), not a Puck field —
  // it's a per-page layout constant, not something the board edits.
  root: {
    render: ({ children, ...props }) => {
      const breite = ((props as unknown as { breite?: Breite }).breite ?? "schmal") as Breite;
      return (
        <div className={`mx-auto flex w-full flex-col gap-6 px-4 ${breiteClass(breite)}`}>
          {children}
        </div>
      );
    },
  },
  components: {
    Ueberschrift: {
      label: "Überschrift",
      fields: {
        text: { type: "text", label: "Text" },
        ebene: {
          type: "select",
          label: "Ebene",
          options: [
            { label: "Groß (h2)", value: "h2" },
            { label: "Klein (h3)", value: "h3" },
          ],
        },
      },
      defaultProps: { text: "Überschrift", ebene: "h2" },
      render: ({ text, ebene }) =>
        ebene === "h3" ? (
          <h3 className="text-xl font-semibold text-bdas-ink">{text}</h3>
        ) : (
          <h2 className="text-2xl font-semibold text-bdas-ink">{text}</h2>
        ),
    },
    Absatz: {
      label: "Absatz",
      fields: { text: { type: "textarea", label: "Text" } },
      defaultProps: { text: "" },
      render: ({ text, puck }) =>
        (text ?? "").trim() === "" && puck?.isEditing ? (
          <BlockPlatzhalter titel="Absatz" hinweis="Noch kein Text erfasst." />
        ) : (
          <p className="whitespace-pre-line text-bdas-ink-body">{text}</p>
        ),
    },
    Fliesstext: {
      label: "Fließtext",
      fields: {
        inhalt: {
          type: "custom",
          label: "Text",
          render: ({ value, onChange }) => <RichTextField value={value} onChange={onChange} />,
        },
      },
      defaultProps: { inhalt: { type: "doc", content: [{ type: "paragraph" }] } },
      render: ({ inhalt, puck }) =>
        istLeererRichText(inhalt) && puck?.isEditing ? (
          <BlockPlatzhalter titel="Fließtext" hinweis="Noch kein Text erfasst." />
        ) : (
          <>{renderRichText(inhalt)}</>
        ),
    },
    PersonenRaster: {
      label: "Personen-Raster",
      fields: {
        personen: {
          type: "array",
          label: "Personen",
          arrayFields: {
            foto: {
              type: "custom",
              label: "Foto",
              render: ({ value, onChange }) => <FotoField value={value} onChange={onChange} />,
            },
            name: { type: "text", label: "Name" },
            rolle: { type: "text", label: "Rolle" },
            uni: { type: "text", label: "Universität" },
            studiengang: { type: "text", label: "Studiengang" },
          },
          defaultItemProps: { foto: "", name: "", rolle: "", uni: "", studiengang: "" },
          getItemSummary: (p) => p.name || "Neue Person",
        },
      },
      defaultProps: { personen: [] },
      // Two columns from the narrowest viewport up: each card is a full-width
      // square photo, so a single column meant a phone showed one person at a
      // time. The tighter gap below `sm` buys the two cards usable width.
      render: ({ personen }) => (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
          {personen.map((p, i) => (
            <Card key={i} className="overflow-hidden">
              {p.foto ? (
                <img src={p.foto} alt={p.name} className="aspect-square w-full object-cover" />
              ) : (
                <div className="aspect-square w-full bg-bdas-surface-hover" aria-hidden />
              )}
              <div className="flex flex-col gap-1 p-4">
                <p className="font-semibold text-bdas-ink">{p.name}</p>
                <p className="text-bdas-ink-body">{p.rolle}</p>
                <p className="text-sm text-bdas-ink-muted">{p.uni}</p>
                <p className="text-sm text-bdas-ink-muted">{p.studiengang}</p>
              </div>
            </Card>
          ))}
        </div>
      ),
    },
    Bild: {
      label: "Bild",
      fields: {
        bild: {
          type: "custom",
          label: "Bild",
          render: ({ value, onChange }) => <FotoField value={value} onChange={onChange} />,
        },
        altText: { type: "text", label: "Alt-Text (Barrierefreiheit)" },
        bildunterschrift: { type: "text", label: "Bildunterschrift (optional)" },
        breite: {
          type: "select",
          label: "Breite",
          options: [
            { label: "Volle Breite", value: "voll" },
            { label: "Halbe Breite", value: "halb" },
          ],
        },
      },
      defaultProps: { bild: "", altText: "", bildunterschrift: "", breite: "voll" },
      render: ({ bild, altText, bildunterschrift, breite, puck }) => {
        if (!bild) {
          return puck?.isEditing ? (
            <BlockPlatzhalter titel="Bild" hinweis="Noch kein Bild ausgewählt." />
          ) : (
            <></>
          );
        }
        return (
          <figure className={breite === "halb" ? "sm:max-w-md" : "w-full"}>
            <img src={bild} alt={altText} className="w-full rounded-bdas" />
            {bildunterschrift ? (
              <figcaption className="mt-2 text-sm text-bdas-ink-muted">
                {bildunterschrift}
              </figcaption>
            ) : null}
          </figure>
        );
      },
    },
    Button: {
      label: "Button",
      fields: {
        label: { type: "text", label: "Beschriftung" },
        href: { type: "text", label: "Link (https://… oder /pfad)" },
        variante: {
          type: "select",
          label: "Variante",
          options: [
            { label: "Primär", value: "primaer" },
            { label: "Sekundär", value: "sekundaer" },
          ],
        },
      },
      defaultProps: { label: "Mehr erfahren", href: "", variante: "primaer" },
      render: ({ label, href, variante, puck }) => {
        const safe = safeHref(href);
        if (!safe) {
          return puck?.isEditing ? (
            <BlockPlatzhalter titel="Button" hinweis="Noch kein gültiger Link hinterlegt." />
          ) : (
            <></>
          );
        }

        const cls =
          variante === "sekundaer"
            ? "inline-flex items-center rounded-bdas-sm border border-bdas-strong px-4 py-2 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
            : "inline-flex items-center rounded-bdas-sm bg-bdas-red px-4 py-2 text-sm font-medium text-white transition-colors duration-bdas-quick ease-bdas hover:opacity-90";
        return isExternalHref(safe) ? (
          <a href={safe} rel="noopener noreferrer" target="_blank" className={cls}>
            {label}
          </a>
        ) : (
          <a href={safe} className={cls}>
            {label}
          </a>
        );
      },
    },
    Zitat: {
      label: "Zitat / Hinweis",
      fields: {
        text: { type: "textarea", label: "Text" },
        quelle: { type: "text", label: "Quelle (optional)" },
      },
      defaultProps: { text: "", quelle: "" },
      render: ({ text, quelle }) => (
        <blockquote className="rounded-bdas border-l-4 border-bdas-red bg-bdas-overlay-hover px-4 py-3">
          <p className="whitespace-pre-line text-bdas-ink-body">{text}</p>
          {quelle ? <footer className="mt-2 text-sm text-bdas-ink-muted">— {quelle}</footer> : null}
        </blockquote>
      ),
    },
    Trenner: {
      label: "Trenner",
      fields: {},
      defaultProps: {},
      render: () => <hr className="border-t border-bdas-soft" />,
    },
    Abstand: {
      label: "Abstand",
      fields: {
        hoehe: {
          type: "select",
          label: "Höhe",
          options: [
            { label: "Klein", value: "klein" },
            { label: "Mittel", value: "mittel" },
            { label: "Groß", value: "gross" },
          ],
        },
      },
      defaultProps: { hoehe: "mittel" },
      render: ({ hoehe }) => (
        <div
          aria-hidden
          className={hoehe === "klein" ? "h-4" : hoehe === "gross" ? "h-16" : "h-8"}
        />
      ),
    },
    Spalten: {
      label: "Spalten",
      fields: {
        anzahl: {
          type: "select",
          label: "Anzahl",
          options: [
            { label: "2 Spalten", value: "2" },
            { label: "3 Spalten", value: "3" },
          ],
        },
      },
      defaultProps: { anzahl: "2" },
      render: ({ anzahl, puck }) => (
        <div className={anzahl === "3" ? "grid gap-6 sm:grid-cols-3" : "grid gap-6 sm:grid-cols-2"}>
          {puck.renderDropZone({ zone: "spalte-1" })}
          {puck.renderDropZone({ zone: "spalte-2" })}
          {anzahl === "3" ? puck.renderDropZone({ zone: "spalte-3" }) : null}
        </div>
      ),
    },
    Organigramm: {
      label: "Organigramm",
      fields: {
        kaesten: {
          type: "array",
          label: "Kästen",
          arrayFields: {
            ebene: {
              type: "select",
              label: "Ebene",
              options: [
                { label: "1 — oberste Ebene", value: "1" },
                { label: "2", value: "2" },
                { label: "3", value: "3" },
                { label: "4", value: "4" },
              ],
            },
            titel: { type: "text", label: "Titel" },
            untertitel: { type: "text", label: "Untertitel" },
            link: { type: "text", label: "Link (optional)" },
            logo: {
              type: "custom",
              label: "Logo (optional)",
              render: ({ value, onChange }) => <FotoField value={value} onChange={onChange} />,
            },
            hervorheben: {
              type: "radio",
              label: "Hervorheben",
              options: [
                { label: "Nein", value: false },
                { label: "Ja", value: true },
              ],
            },
          },
          defaultItemProps: {
            ebene: "1",
            titel: "",
            untertitel: "",
            link: "",
            logo: "",
            hervorheben: false,
          },
          getItemSummary: (kasten) =>
            kasten.titel ? `${kasten.ebene} · ${kasten.titel}` : "Neuer Kasten",
        },
      },
      defaultProps: { kaesten: [] },
      render: ({ kaesten }) => <Organigramm kaesten={kaesten} />,
    },
  },
};
