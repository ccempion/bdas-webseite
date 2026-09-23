/** Shown on every staging page so nobody mistakes it for bdas.de (ADR 0053). */
export function StagingBanner() {
  return (
    <div
      role="note"
      className="bg-bdas-red px-4 py-1.5 text-center text-sm font-semibold text-bdas-ink-on-brand"
    >
      TESTUMGEBUNG: Daten hier sind nicht echt und können jederzeit gelöscht werden. E-Mails gehen
      nur an das Test-Postfach.
    </div>
  );
}
