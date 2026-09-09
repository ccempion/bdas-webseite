# ADR 0039 — Ein Konto ist seine `user_id` **und** seine Adresse

**Status:** akzeptiert
**Datum:** 2026-09-09
**Betrifft:** `modules/newsletter`, die Newsletter-Flächen in `apps/web`
**Ergänzt:** ADR 0035 (Newsletter-Einwilligungsmodell)

## Kontext

Eine Newsletter-Zeile kann auf zwei Arten zu einem Konto gehören: über
`user_id` oder über die Adresse. Beide kommen im Normalbetrieb vor, weil eine
Eintragung über ein öffentliches Formular anonym entsteht — sie kennt nur die
Adresse.

Verknüpft wurde bisher an genau zwei Stellen:

- `subscribeAsUser` trifft `or(user_id, email)` und adoptiert eine anonyme
  Zeile beim Klick.
- Der Bus-Handler auf `auth.user.verified` adoptiert sie im Moment der
  E-Mail-Verifikation.

Beides sind Momente. Wer sich **nach** der Verifikation seines Kontos über ein
öffentliches Formular einträgt, erwischt keinen davon: Das Ereignis ist längst
gefeuert, und geklickt hat er den Ein-Klick-Knopf nie. Die Zeile behält die
Adresse und bekommt nie eine `user_id`.

Alle lesenden und die übrigen schreibenden Zugriffe trafen dagegen nur über
`user_id`. Aus dieser Asymmetrie folgten drei Symptome, die in Produktion
auftraten:

1. Eingeloggt wurden alle Anmeldeflächen weiter angezeigt — Footer, Puck-Block,
   Scroll-Panel und der C1-Hinweis auf `/account` — obwohl die Adresse auf der
   Liste stand.
2. Der Schalter unter `/account/einstellungen` behauptete „nicht dabei".
3. Schlimmer: **Abbestellen war unmöglich.** `unsubscribeAsUser` fand die Zeile
   nicht, gab still zurück, und die betroffene Person hatte keinen Weg aus dem
   Verteiler außer dem Abmeldelink in einer Mail.

## Entscheidung

Das Modul erkennt ein Konto an **beidem**. Ein einziger exportierter Ausdruck
`accountMatch({ userId, email })` in `modules/newsletter/src/account-match.ts`
liefert `or(user_id, email)`, und jeder kontobezogene Zugriff geht dort durch:

| Funktion                                 | vorher          | jetzt          |
| ---------------------------------------- | --------------- | -------------- |
| `subscribeAsUser`                        | `or(id, email)` | unverändert    |
| `getSubscriptionForUser` → `…ForAccount` | nur `id`        | `accountMatch` |
| `shouldPrompt`                           | nur `id`        | `accountMatch` |
| `unsubscribeAsUser`                      | nur `id`        | `accountMatch` |

Ein Ausdruck statt vier Kopien von `or(...)`, weil genau die Vervielfältigung
dieser Bedingung der Ursprung des Fehlers war.

`unsubscribeAsUser` **adoptiert** die Zeile dabei (setzt `user_id`). Das ist
ohnehin ein Schreibpfad; sie unverknüpft zu lassen hieße, dass Konto und Zeile
weiter uneins darüber wären, wem die Adresse gehört.

## Was bewusst nicht mitgeändert wird

- **Keine Schreibvorgänge auf Lesepfaden.** Die Zeile wird beim Anzeigen nicht
  adoptiert, sondern erst, wenn jemand handelt. Ein `SELECT`, das schreibt, ist
  auf einer Fläche, die auf jeder Seite hängt, kein guter Handel.
- **Keine Daten-Migration.** Bestehende verwaiste Zeilen findet der neue
  Treffer sofort; ein Backfill wäre Risiko ohne Gewinn.
- **`declineForUser` bleibt an der `user_id`.** Der Wegklick-Zähler hält fest,
  was _dieses Konto_ geklickt hat — etwas, das eine anonyme Zeile nicht tragen
  kann. Der Pfad ist mit adressbewusstem `shouldPrompt` ohnehin unerreichbar,
  sobald die Adresse auf der Liste steht, und der Unique-Key auf `email`
  verhindert eine Dublette.

## Folgen

Positiv: Wer auf der Liste steht, sieht kein Anmeldeangebot mehr und kann sich
unter „Mein Konto" abbestellen. Die Regel ist an einer Stelle nachlesbar.

Negativ: Jeder kontobezogene Aufruf muss jetzt die Adresse mitführen, nicht nur
die Id. Das ändert vier öffentliche Signaturen des Moduls — bewusst als
Bruch, damit kein Aufrufer versehentlich beim halben Treffer bleibt.

**Nicht gelöst und nicht lösbar:** Ein ausgeloggter Besucher in einem fremden
Browser sieht weiter das Anmeldeformular. Seine Adresse kennt der Server nicht,
bevor er sie tippt — und ein Formular, das danach „bist du schon" antwortet,
wäre ein Adress-Orakel: Jeder könnte Adressen durchprobieren und erfahren, wer
auf der Liste steht. Spec §8 Nr. 4 („identische Antwort") und §13.2 verbieten
das ausdrücklich. Was hilft, ist der Browser-Merker: Er wird jetzt auch auf
`/newsletter/bestaetigen` gesetzt, sodass das Gerät, auf dem jemand bestätigt,
danach schweigt.
