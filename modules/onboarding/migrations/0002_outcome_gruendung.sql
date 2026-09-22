-- Neuer Ausgang `student_gruendung`: wer in seiner Stadt keine Gruppe findet,
-- kann eine gründen wollen (Design 2026-09-22, ADR 0050). Der Ausgang steht im
-- Ablauf in flow.ts; die Spalte muss ihn ebenfalls zulassen.

ALTER TABLE onboarding_journeys
  DROP CONSTRAINT onboarding_journeys_outcome_check;

ALTER TABLE onboarding_journeys
  ADD CONSTRAINT onboarding_journeys_outcome_check CHECK (outcome IN (
    'student','student_gruendung','student_ohne_gruppe','alumnus','foerderer','bdaj'
  ));
