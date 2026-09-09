# ADR 0040 — Karussell ohne neue Abhängigkeit

- **Status:** Accepted
- **Date:** 2026-09-09
- **Supersedes:** —
- **Superseded by:** —
- **Betrifft:** `apps/web/app/_content`, `core/design-system`
- **Verhältnis zur Spec:** weicht von §7 und §8 der Design-Spec
  `2026-09-08-content-pages-layout-erweiterung-design.md` ab; ADR 0036 bleibt
  im Übrigen unberührt.

## Context

§8 der Spec sah für den Karussell-Block `embla-carousel-react` vor, bezogen
über `pnpm dlx shadcn@latest add carousel`. Beim Umsetzen zeigte sich: Dieser
Weg existiert im Repo nicht. Es gibt keine `components.json` und keine
shadcn-Installation; die Primitives in `core/design-system/src/components/`
(Dialog, Combobox, PasswordInput) sind von Hand im shadcn-Stil geschrieben.
Die CLI hätte ein zweites Komponenten-Zuhause neben `core/design-system`
aufgemacht und Dubletten bestehender Primitives mitgebracht.

Damit stand die Abhängigkeit selbst zur Frage. Zwei Dinge fielen dabei auf:
Tastatur-Navigation bringt embla **nicht** von Haus aus mit — das ist ein
Keydown-Handler in shadcns Wrapper, den wir so oder so selbst geschrieben
hätten; §8 hatte das zu Recht als offene Frage markiert. Und die Anforderung
aus §6 ist bescheiden: kein Autoplay, kein Loop, eine Folie pro Sichtfeld.

## Decision

Das Karussell entsteht aus CSS: ein horizontaler Scroll-Container mit
`snap-x snap-mandatory`, eine Folie pro Sichtfeld. Wischen, Schwung und
Pfeiltasten liefert der Browser. Pfeil-Buttons rufen `scrollBy`, Punkte
`scrollTo`; welche Folie aktiv ist, entscheidet eine reine Funktion über
`scrollLeft` und Schienenbreite.

Keine neue Laufzeit-Abhängigkeit. Damit ist die Block-Erweiterung aus ADR 0036
vollständig, ohne dass das Projekt eine einzige Bibliothek dazugewonnen hat.

Zwei kleinere Abweichungen von §7 gehören dazu:

- Die Navigationspunkte tragen `radii.full`, nicht den Pill-Radius. Die
  Token-Skala reserviert `full` ausdrücklich für „genuinely circular elements
  — nav buttons, markers, dots".
- Das Rezept nennt für den Folienwechsel keine Dauer. Ein nativer Smooth-Scroll
  nimmt keine an; die Dauer gehört dem Browser. Eine Zahl, die nichts steuert,
  wäre falsche Präzision.

## Consequences

**Dafür:** Kein Bundle-Zuwachs, keine Abhängigkeit, die gepflegt und aktualisiert
werden will. Alle Folien stehen im DOM, ohne `aria-hidden`-Turnübungen — der
Block liest sich für Screenreader als das, was er ist, eine Liste. Ohne
JavaScript bleibt er vollständig lesbar und von Hand scrollbar.

**Dagegen:** Kein Endlos-Loop und keine Feinsteuerung der Wechsel-Animation.
Beides verlangt §6 ausdrücklich nicht. Sollte später ein Karussell mit Loop
oder Autoplay gebraucht werden, ist das eine neue Entscheidung — und dann
spricht nichts gegen embla.

**Offen:** Ein Karussell mit mehreren Folien nebeneinander gibt es bewusst nicht;
dafür ist `KartenRaster` da. Die Abgrenzung lebt in den Block-Labels, nicht im
Code.
