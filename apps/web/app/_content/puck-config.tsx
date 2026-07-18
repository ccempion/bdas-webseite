import type { Config } from "@puckeditor/core";
import React from "react";

import { Card } from "@bdas/design-system";

import { FotoField } from "./FotoField";
import { RichTextField } from "./RichTextField";
import { renderRichText } from "./rich-text";
import { isExternalHref, safeHref } from "./href";

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
};

/**
 * Block palette for board-editable pages (spec §4). Deliberately small —
 * every extra block is maintenance. No raw-HTML block, ever: text renders
 * React-escaped, which is the structural XSS exclusion the spec relies on.
 */
export const puckConfig: Config<Blocks> = {
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
      render: ({ text }) => <p className="whitespace-pre-line text-bdas-ink-body">{text}</p>,
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
      render: ({ inhalt }) => <>{renderRichText(inhalt)}</>,
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
            rolle: { type: "text", label: "Rolle im BSR" },
            uni: { type: "text", label: "Universität" },
            studiengang: { type: "text", label: "Studiengang" },
          },
          defaultItemProps: { foto: "", name: "", rolle: "", uni: "", studiengang: "" },
          getItemSummary: (p) => p.name || "Neue Person",
        },
      },
      defaultProps: { personen: [] },
      render: ({ personen }) => (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
      render: ({ bild, altText, bildunterschrift, breite }) =>
        bild ? (
          <figure className={breite === "halb" ? "sm:max-w-md" : "w-full"}>
            <img src={bild} alt={altText} className="w-full rounded-bdas" />
            {bildunterschrift ? (
              <figcaption className="mt-2 text-sm text-bdas-ink-muted">{bildunterschrift}</figcaption>
            ) : null}
          </figure>
        ) : (null as unknown as JSX.Element),
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
      render: ({ label, href, variante }) => {
        const safe = safeHref(href);
        if (!safe) return null as unknown as JSX.Element;
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
  },
};
