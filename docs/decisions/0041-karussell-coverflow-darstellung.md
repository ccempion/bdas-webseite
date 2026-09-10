# ADR 0041 — Karussell: Coverflow-Darstellung

- **Status:** Accepted
- **Date:** 2026-09-10
- **Supersedes:** —
- **Superseded by:** —
- **Betrifft:** `apps/web/app/_content`, `core/design-system`
- **Verhältnis zur Spec:** ergänzt den Karussell-Baustein aus ADR 0036/0040 um
  eine zweite Darstellung; ADR 0040 bleibt im Übrigen unberührt.

## Context

Der Karussell-Block zeigt bislang eine flache Schiene: eine Folie pro
Sichtfeld, siehe ADR 0040. Für ausgewählte Seiten soll dieselbe Schiene
zusätzlich als 3-D-Coverflow lesbar sein — die zentrierte Folie steht
aufrecht, ihre Nachbarn kippen nach hinten weg und wirken als Trapeze.

Vier Fragen mussten dafür entschieden werden: ob das ein eigener Baustein
wird oder eine Variante des bestehenden; wie sich der Effekt zum
Puck-Editor verhält, der Ablegeziele über Mauskoordinaten ermittelt; was bei
wenigen Folien passiert, wenn eine Mitte fehlt; und ob der Effekt eine neue
Abhängigkeit rechtfertigt.

## Decision

**Variante statt zweitem Baustein.** Pfeile, Punkte, Einrast-Schiene und die
Screenreader-Auszeichnung sind in beiden Darstellungen identisch; ein
zweiter Block hätte sie dupliziert. Der Preis: der Baustein trägt jetzt zwei
Darstellungen, die Komponente wird länger.

**Der Editor bleibt flach.** Puck ermittelt Ablegeziele über
Mauskoordinaten; `transform` verschiebt die sichtbare Fläche gegenüber der
Layout-Fläche. Um Drag & Drop nicht zu riskieren, erzwingt der Editor
`klassisch`. Folge: der Vorstand beurteilt den Effekt in der Vorschau oder
auf der veröffentlichten Seite, nicht im Bearbeitungs-Canvas.

**Unter drei Folien klassisch.** Ein Coverflow mit zwei Bildern hat keine
Mitte; die Darstellung fällt still zurück statt kaputt auszusehen.

**Weiterhin keine neue Abhängigkeit.** Perspektive und Drehung sind CSS; die
Interpolation ist eine reine Funktion über die Scroll-Position.

Die Zahlen, die der Effekt braucht, leben als benannte Tokens in
`core/design-system/src/tokens.ts` (`coverflow`): `perspective` (1200),
`tiltDeg` (38), `scale` (0.82), `opacity` (0.55), `maxSlots` (2) und
`slideWidthPct` (70). Es sind bewusst reine Zahlen ohne Einheit — die Kippung
wird aus einer gebrochenen Distanz zur Mitte interpoliert, dafür muss mit den
Werten gerechnet werden, bevor eine Einheit drankommt.

## Consequences

**Dafür:** Ein Baustein, eine Navigationslogik, ein Ort für Zugänglichkeit.
Kein Risiko für den Editor-Canvas, weil dieser den Effekt gar nicht erst
zeigt. Kein Bundle-Zuwachs — reines CSS plus eine reine Interpolationsfunktion.

**Dagegen:** Die Komponente wird komplexer, weil sie zwei Darstellungen
trägt statt einer. Der Vorstand kann den Effekt nicht direkt im Editor sehen,
sondern muss in die Vorschau wechseln.
