import { type Config, type Data, transformProps } from "@puckeditor/core";
import React from "react";

import { Card } from "@bdas/design-system";

import { legalUrls } from "../../lib/legal";
import { PublicFooterView } from "../_public/PublicFooterView";
import { PublicHeaderView } from "../_public/PublicHeaderView";
import type { CanvasChrome } from "./canvas-chrome";
import { type Ausrichtung, ausrichtungFlex, ausrichtungText } from "./ausrichtung";
import { buttonKlasse } from "./button-klasse";
import { type BildBreite, bildBreiteClass, normalizeBildBreite } from "./bild-breite";
import { BildGroesseGriff } from "./BildGroesseGriff";
import { FotoField } from "./FotoField";
import { Hero, type HeroHintergrund, type HeroHoehe } from "./Hero";
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
  Ueberschrift: { text: string; ebene: "h2" | "h3"; ausrichtung: Ausrichtung };
  Absatz: { text: string; ausrichtung: Ausrichtung };
  PersonenRaster: { personen: Person[] };
  Fliesstext: {
    inhalt: unknown;
    ausrichtung: Ausrichtung;
  };
  Bild: {
    bild: string;
    altText: string;
    bildunterschrift: string;
    breite: BildBreite;
    ausrichtung: Ausrichtung;
  };
  Button: {
    label: string;
    href: string;
    variante: "primaer" | "sekundaer";
    ausrichtung: Ausrichtung;
  };
  Zitat: {
    text: string;
    quelle: string;
    ausrichtung: Ausrichtung;
  };
  Trenner: Record<string, never>;
  Abstand: {
    hoehe: "klein" | "mittel" | "gross";
  };
  Spalten: {
    anzahl: "2" | "3" | "4" | "1-2" | "2-1";
  };
  Organigramm: { kaesten: Kasten[] };
  Panel: { titel: string; variante: "standard" | "hervorgehoben" };
  Akkordeon: { eintraege: { frage: string; antwort: string }[] };
  Hero: {
    ueberschrift: string;
    untertext: string;
    hintergrund: HeroHintergrund;
    bild: string;
    hoehe: HeroHoehe;
    ausrichtung: Ausrichtung;
    buttonLabel: string;
    buttonHref: string;
  };
};

/** Content-column width. Carried on the page's root so the same value frames
 *  the blocks in the editor preview (`<Puck>`) and the public page (`<Render>`).
 *  `breit` gives the person grid room; text pages stay at reading width. */
export type Breite = "schmal" | "breit" | "voll";

export const breiteClass = (breite: Breite): string =>
  breite === "breit" ? "max-w-5xl" : breite === "voll" ? "" : "max-w-3xl";

/** Marks the canvas chrome as decoration: not focusable, not in the
 *  accessibility tree, not clickable.
 *
 *  The empty string is deliberate and the cast goes with it. `@types/react`
 *  18.3 types `inert` as a boolean, but React 18's DOM renderer has no special
 *  handling for it and *drops* `inert={true}` with "Received `true` for a
 *  non-boolean attribute" — verified, it emits a bare `<div>`. `inert=""` is
 *  the canonical HTML boolean attribute and is what actually reaches the DOM.
 *  Revisit on the React 19 upgrade, which renders the boolean form properly.
 *
 *  `pointer-events-none` stays as the fallback for browsers without `inert`. */
const INERT = {
  inert: "",
  className: "pointer-events-none",
} as unknown as React.ComponentProps<"div">;

const ausrichtungField = {
  type: "select" as const,
  label: "Ausrichtung",
  options: [
    { label: "Linksbündig", value: "links" },
    { label: "Mittig", value: "mittig" },
    { label: "Rechtsbündig", value: "rechts" },
  ],
};

const SPALTEN_LAYOUT: Record<
  Blocks["Spalten"]["anzahl"],
  { grid: string; zonen: { zone: string; span?: string }[] }
> = {
  "2": {
    grid: "grid gap-6 sm:grid-cols-2",
    zonen: [{ zone: "spalte-1" }, { zone: "spalte-2" }],
  },
  "3": {
    grid: "grid gap-6 sm:grid-cols-3",
    zonen: [{ zone: "spalte-1" }, { zone: "spalte-2" }, { zone: "spalte-3" }],
  },
  "4": {
    grid: "grid gap-6 sm:grid-cols-2 lg:grid-cols-4",
    zonen: [{ zone: "spalte-1" }, { zone: "spalte-2" }, { zone: "spalte-3" }, { zone: "spalte-4" }],
  },
  "1-2": {
    grid: "grid gap-6 sm:grid-cols-3",
    zonen: [
      { zone: "spalte-1", span: "sm:col-span-1" },
      { zone: "spalte-2", span: "sm:col-span-2" },
    ],
  },
  "2-1": {
    grid: "grid gap-6 sm:grid-cols-3",
    zonen: [
      { zone: "spalte-1", span: "sm:col-span-2" },
      { zone: "spalte-2", span: "sm:col-span-1" },
    ],
  },
};

/** Keys for the Akkordeon entries. `<details>` open/closed is DOM state, so an
 *  index key would leave the open row behind as soon as the board reorders
 *  entries in the editor: React would reuse the node at position 0 for whatever
 *  moved there. The question is the entry's natural identity; duplicates and
 *  empty questions fall back to a positional key so React still sees distinct
 *  values. */
export const akkordeonKeys = (eintraege: { frage: string }[]): string[] => {
  const gesehen = new Map<string, number>();
  return eintraege.map((e, i) => {
    const basis = e.frage || `eintrag-${i}`;
    const n = (gesehen.get(basis) ?? 0) + 1;
    gesehen.set(basis, n);
    return n === 1 ? basis : `${basis}#${n}`;
  });
};

/** Legal-text pages stay at reading width — "voll" is never offered there,
 *  enforced here rather than left to editorial judgement (spec §4). */
const LEGAL_SLUGS = new Set(["datenschutz", "impressum", "nutzungsbedingungen"]);

const BREITE_OPTIONS = [
  { label: "Schmal", value: "schmal" },
  { label: "Breit", value: "breit" },
  { label: "Volle Breite", value: "voll" },
] as const;

const breiteField = {
  type: "select" as const,
  label: "Breite",
  options: BREITE_OPTIONS,
};

const breiteFieldOhneVoll = {
  type: "select" as const,
  label: "Breite",
  options: BREITE_OPTIONS.filter((o) => o.value !== "voll"),
};

/** The single seam every Puck tree passes through, on all eight paths — the
 *  seven public `<Render>` call sites and `<Puck>`.
 *
 *  Two jobs. First, ensure the document carries a `breite`: documents authored
 *  before the root existed have none, and the fallback differs per page so the
 *  editor and the published page frame them identically. Second, migrate
 *  `Bild.breite` off the legacy `"voll" | "halb"` strings onto the numeric
 *  scale.
 *
 *  Order matters: the width is seeded first because `transformProps` unwraps
 *  `data.root` to `data.root.props` when the incoming root has no `props` key,
 *  which would rewrite the document into the legacy root shape. */
export function normalizeContent(data: Data, fallback: Breite): Data {
  const props = (data.root?.props ?? {}) as Record<string, unknown>;
  const mitBreite =
    props.breite === "schmal" || props.breite === "breit" || props.breite === "voll"
      ? data
      : ({ ...data, root: { ...data.root, props: { ...props, breite: fallback } } } as Data);

  return transformProps(mitBreite, {
    Bild: (bild) => ({ ...bild, breite: normalizeBildBreite(bild.breite) }),
  });
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
  root: {
    fields: {
      breite: breiteField,
    },
    resolveFields: (_data, { metadata }) => {
      const slug = (metadata as { slug?: string } | undefined)?.slug;
      return {
        breite: slug !== undefined && LEGAL_SLUGS.has(slug) ? breiteFieldOhneVoll : breiteField,
      };
    },
    render: ({ children, ...props }) => {
      const breite = ((props as unknown as { breite?: Breite }).breite ?? "schmal") as Breite;
      const puck = (props as unknown as { puck?: { isEditing?: boolean; metadata?: unknown } })
        .puck;
      const spalte = (
        <div className={`mx-auto flex w-full flex-col gap-6 px-4 ${breiteClass(breite)}`}>
          {children}
        </div>
      );
      if (!puck?.isEditing) return spalte;

      // Editor only. `<Render>` never sets isEditing, so a visitor cannot get a
      // second header — the layout already renders one.
      //
      // Everything here comes from metadata rather than being derived on the
      // spot: this runs in the browser, where `isFlagOn` reads a computed
      // `process.env` key that Next cannot inline, so every flag would read
      // false. See `canvas-chrome.ts`.
      const chrome = (puck.metadata as { chrome?: CanvasChrome })?.chrome;
      const { privacy, imprint, terms } = legalUrls();
      return (
        // `min-h-screen`, not `min-h-full`: `min-height: 100%` needs a definite
        // containing-block height, which the Puck iframe root does not set, so
        // the footer would float under short pages instead of sitting at the
        // bottom as it does on the real page.
        <div className="flex min-h-screen flex-col">
          {/* Decoration, not navigation. `inert` and not merely
              `pointer-events-none`: that stops the mouse but not the keyboard,
              and tabbing onto a nav link and pressing Enter would navigate the
              canvas iframe away and the board would lose the editor. `inert`
              also implies aria-hidden without leaving focusable controls behind
              it, which is the `aria-hidden-focus` violation. */}
          <div {...INERT}>
            <PublicHeaderView items={chrome?.navItems ?? []} konto={null} />
          </div>
          <div className="flex-1 py-12">{spalte}</div>
          <div {...INERT}>
            <PublicFooterView
              privacyUrl={privacy}
              imprintUrl={imprint}
              termsUrl={terms}
              showEvents={chrome?.events ?? false}
              showGroups={chrome?.groups ?? false}
              showFaq={chrome?.faq ?? false}
            />
          </div>
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
        ausrichtung: ausrichtungField,
      },
      defaultProps: { text: "Überschrift", ebene: "h2", ausrichtung: "links" },
      render: ({ text, ebene, ausrichtung }) =>
        ebene === "h3" ? (
          <h3 className={`text-xl font-semibold text-bdas-ink ${ausrichtungText(ausrichtung)}`}>
            {text}
          </h3>
        ) : (
          <h2 className={`text-2xl font-semibold text-bdas-ink ${ausrichtungText(ausrichtung)}`}>
            {text}
          </h2>
        ),
    },
    Absatz: {
      label: "Absatz",
      fields: {
        text: { type: "textarea", label: "Text" },
        ausrichtung: ausrichtungField,
      },
      defaultProps: { text: "", ausrichtung: "links" },
      render: ({ text, ausrichtung, puck }) =>
        (text ?? "").trim() === "" && puck?.isEditing ? (
          <BlockPlatzhalter titel="Absatz" hinweis="Noch kein Text erfasst." />
        ) : (
          <p className={`whitespace-pre-line text-bdas-ink-body ${ausrichtungText(ausrichtung)}`}>
            {text}
          </p>
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
        ausrichtung: ausrichtungField,
      },
      defaultProps: {
        inhalt: { type: "doc", content: [{ type: "paragraph" }] },
        ausrichtung: "links",
      },
      // `prose` is what the Tiptap field itself renders in, and what every
      // other rich-text surface (Blog, Events) publishes in: without it
      // preflight's `p { margin: 0 }` runs the author's paragraphs together.
      render: ({ inhalt, ausrichtung, puck }) =>
        istLeererRichText(inhalt) ? (
          puck?.isEditing ? (
            <BlockPlatzhalter titel="Fließtext" hinweis="Noch kein Text erfasst." />
          ) : (
            <></>
          )
        ) : (
          <div className={`prose max-w-none text-bdas-ink-body ${ausrichtungText(ausrichtung)}`}>
            {renderRichText(inhalt)}
          </div>
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
      render: ({ personen, puck }) =>
        (personen ?? []).length === 0 && puck?.isEditing ? (
          <BlockPlatzhalter titel="Personen-Raster" hinweis="Noch keine Personen hinzugefügt." />
        ) : (
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
            { label: "25 %", value: 25 },
            { label: "50 %", value: 50 },
            { label: "75 %", value: 75 },
            { label: "100 %", value: 100 },
          ],
        },
        ausrichtung: ausrichtungField,
      },
      defaultProps: {
        bild: "",
        altText: "",
        bildunterschrift: "",
        breite: 100,
        ausrichtung: "links",
      },
      render: ({ id, bild, altText, bildunterschrift, breite, ausrichtung, puck }) => {
        if (!bild) {
          return puck?.isEditing ? (
            <BlockPlatzhalter titel="Bild" hinweis="Noch kein Bild ausgewählt." />
          ) : (
            <></>
          );
        }
        return (
          // `data-bild-rahmen` marks the alignment wrapper, not the figure: the
          // wrapper spans the full content column, which is the width the
          // percentage is a percentage *of*. Measuring the figure would make
          // each drag relative to the size the last drag produced.
          <div className={`flex ${ausrichtungFlex(ausrichtung)}`} data-bild-rahmen>
            <figure className={`relative ${bildBreiteClass(breite)}`}>
              <img src={bild} alt={altText} className="w-full rounded-bdas" />
              {bildunterschrift ? (
                <figcaption
                  className={`mt-2 text-sm text-bdas-ink-muted ${ausrichtungText(ausrichtung)}`}
                >
                  {bildunterschrift}
                </figcaption>
              ) : null}
              {puck?.isEditing ? <BildGroesseGriff id={id} breite={breite} /> : null}
            </figure>
          </div>
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
        ausrichtung: ausrichtungField,
      },
      defaultProps: { label: "Mehr erfahren", href: "", variante: "primaer", ausrichtung: "links" },
      render: ({ label, href, variante, ausrichtung, puck }) => {
        const safe = safeHref(href);
        if (!safe) {
          return puck?.isEditing ? (
            <BlockPlatzhalter titel="Button" hinweis="Noch kein gültiger Link hinterlegt." />
          ) : (
            <></>
          );
        }

        const cls = buttonKlasse(variante);
        return (
          <div className={`flex ${ausrichtungFlex(ausrichtung)}`}>
            {isExternalHref(safe) ? (
              <a href={safe} rel="noopener noreferrer" target="_blank" className={cls}>
                {label}
              </a>
            ) : (
              <a href={safe} className={cls}>
                {label}
              </a>
            )}
          </div>
        );
      },
    },
    Zitat: {
      label: "Zitat / Hinweis",
      fields: {
        text: { type: "textarea", label: "Text" },
        quelle: { type: "text", label: "Quelle (optional)" },
        ausrichtung: ausrichtungField,
      },
      defaultProps: { text: "", quelle: "", ausrichtung: "links" },
      render: ({ text, quelle, ausrichtung }) => (
        <blockquote
          className={`rounded-bdas border-l-4 border-bdas-red bg-bdas-overlay-hover px-4 py-3 ${ausrichtungText(ausrichtung)}`}
        >
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
            { label: "4 Spalten", value: "4" },
            { label: "1/3 + 2/3", value: "1-2" },
            { label: "2/3 + 1/3", value: "2-1" },
          ],
        },
      },
      defaultProps: { anzahl: "2" },
      render: ({ anzahl, puck }) => {
        const layout = SPALTEN_LAYOUT[anzahl];
        return (
          <div className={layout.grid}>
            {layout.zonen.map(({ zone, span }) =>
              span ? (
                <div key={zone} className={span}>
                  {puck.renderDropZone({ zone })}
                </div>
              ) : (
                <React.Fragment key={zone}>{puck.renderDropZone({ zone })}</React.Fragment>
              ),
            )}
          </div>
        );
      },
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
      render: ({ kaesten, puck }) =>
        (kaesten ?? []).length === 0 && puck?.isEditing ? (
          <BlockPlatzhalter titel="Organigramm" hinweis="Noch keine Kästen angelegt." />
        ) : (
          <Organigramm kaesten={kaesten} />
        ),
    },
    Panel: {
      label: "Panel / Kasten",
      fields: {
        titel: { type: "text", label: "Titel (optional)" },
        variante: {
          type: "select",
          label: "Variante",
          options: [
            { label: "Standard", value: "standard" },
            { label: "Hervorgehoben", value: "hervorgehoben" },
          ],
        },
      },
      defaultProps: { titel: "", variante: "standard" },
      render: ({ titel, variante, puck }) => (
        <Card className={variante === "hervorgehoben" ? "border-l-4 border-l-bdas-red p-6" : "p-6"}>
          {titel ? <p className="mb-3 font-semibold text-bdas-ink">{titel}</p> : null}
          {puck.renderDropZone({ zone: "inhalt" })}
        </Card>
      ),
    },
    Akkordeon: {
      label: "Akkordeon",
      fields: {
        eintraege: {
          type: "array",
          label: "Einträge",
          arrayFields: {
            frage: { type: "text", label: "Frage" },
            antwort: { type: "textarea", label: "Antwort" },
          },
          defaultItemProps: { frage: "", antwort: "" },
          getItemSummary: (e) => e.frage || "Neuer Eintrag",
        },
      },
      defaultProps: { eintraege: [] },
      render: ({ eintraege, puck }) => {
        const liste = eintraege ?? [];
        const keys = akkordeonKeys(liste);
        return liste.length === 0 && puck?.isEditing ? (
          <BlockPlatzhalter titel="Akkordeon" hinweis="Noch keine Einträge hinzugefügt." />
        ) : (
          <div className="flex flex-col gap-3">
            {liste.map((e, i) => (
              <details key={keys[i]} className="bdas-accordion">
                <summary>{e.frage}</summary>
                <div>
                  <p className="whitespace-pre-line text-bdas-ink-body">{e.antwort}</p>
                </div>
              </details>
            ))}
          </div>
        );
      },
    },
    Hero: {
      label: "Hero / Aufmacher",
      fields: {
        ueberschrift: { type: "text", label: "Überschrift" },
        untertext: { type: "textarea", label: "Untertext (optional)" },
        hintergrund: {
          type: "select",
          label: "Hintergrund",
          options: [
            { label: "Helle Fläche", value: "hell" },
            { label: "Akzentfarbe", value: "akzent" },
            { label: "Bild", value: "bild" },
          ],
        },
        bild: {
          type: "custom",
          label: "Hintergrundbild (nur bei Hintergrund „Bild“)",
          render: ({ value, onChange }) => <FotoField value={value} onChange={onChange} />,
        },
        hoehe: {
          type: "select",
          label: "Höhe",
          options: [
            { label: "Kompakt", value: "kompakt" },
            { label: "Mittel", value: "mittel" },
            { label: "Groß", value: "gross" },
          ],
        },
        ausrichtung: ausrichtungField,
        buttonLabel: { type: "text", label: "Button-Beschriftung (optional)" },
        buttonHref: { type: "text", label: "Button-Link (https://… oder /pfad)" },
      },
      defaultProps: {
        ueberschrift: "Überschrift",
        untertext: "",
        hintergrund: "hell",
        bild: "",
        hoehe: "mittel",
        ausrichtung: "links",
        buttonLabel: "",
        buttonHref: "",
      },
      // Empty means nothing at all on the public page — an empty coloured box
      // is worse than no block. Same shape the `Bild` and `Button` blocks use:
      // placeholder in the editor, `<></>` outside it. The placeholder is
      // gated on `isEditing` because the structural sweep in the tests renders
      // every block with `isEditing: false` and asserts none reaches a reader.
      render: ({
        ueberschrift,
        untertext,
        hintergrund,
        bild,
        hoehe,
        ausrichtung,
        buttonLabel,
        buttonHref,
        puck,
      }) => {
        // The image only counts while the background actually uses it. It
        // cannot be cleared through `FotoField`, so a photo the board uploaded
        // and then switched away from would otherwise keep an empty Hero alive
        // as a tall coloured box. The button counts only when it would render:
        // `Hero` drops a label without a safe href, and a frame around an
        // invisible button is not content.
        const hatBild = hintergrund === "bild" && (bild ?? "") !== "";
        const hatButton = (buttonLabel ?? "").trim() !== "" && safeHref(buttonHref ?? "") !== null;
        if ((ueberschrift ?? "") === "" && (untertext ?? "") === "" && !hatBild && !hatButton) {
          return puck?.isEditing ? (
            <BlockPlatzhalter
              titel="Hero / Aufmacher"
              hinweis="Noch kein Inhalt — Überschrift, Untertext, Bild oder Button ergänzen."
            />
          ) : (
            <></>
          );
        }
        return (
          <Hero
            ueberschrift={ueberschrift}
            untertext={untertext}
            hintergrund={hintergrund}
            bild={bild}
            hoehe={hoehe}
            ausrichtung={ausrichtung}
            buttonLabel={buttonLabel}
            buttonHref={buttonHref}
          />
        );
      },
    },
  },
};
