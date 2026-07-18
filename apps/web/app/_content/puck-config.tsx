import type { Config } from "@puckeditor/core";

import { Card } from "@bdas/design-system";

import { FotoField } from "./FotoField";

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
                // eslint-disable-next-line @next/next/no-img-element -- Supabase-hosted, next/image needs remotePatterns
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
  },
};
