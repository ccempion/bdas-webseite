/** The four Arbeitsgruppen. Hardcoded by design (spec §3) — becomes data
 *  only if AGs ever get their own module. Copy = placeholder (spec §8). */
export const AGS = [
  {
    slug: "oeffentlichkeitsarbeit",
    name: "Öffentlichkeitsarbeit & Social Media",
    teaser: "Wir gestalten die Außendarstellung des BDAS — von Instagram bis zur Pressemitteilung.",
  },
  {
    slug: "medizin",
    name: "Medizin",
    teaser: "Vernetzung und Austausch für Studierende der Medizin und Gesundheitsberufe.",
  },
  {
    slug: "ingenieurwesen-technik",
    name: "Ingenieurwesen & Technik",
    teaser: "Von Maschinenbau bis Informatik — Projekte und Kontakte für Technikstudierende.",
  },
  {
    slug: "jura",
    name: "Jura",
    teaser: "Austausch für Jurastudierende — vom Staatsexamen bis zum Berufseinstieg.",
  },
] as const;
