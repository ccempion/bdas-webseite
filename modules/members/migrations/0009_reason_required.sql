-- Members module — enforce that a reason is required on rejection (ADR 0031, part 2).
--
-- DO NOT apply this migration until the service-layer change that makes
-- decideGroupChange() always write reason_category/reason_message on
-- rejection has been deployed. Migrations here are applied by hand and
-- decoupled from deploys, so "after" means after that code is live in the
-- environment this runs against — not merely merged. Applying this
-- constraint first will make every rejection decision fail with a check
-- constraint violation until the service-layer change catches up.
ALTER TABLE member_group_change_requests
  ADD CONSTRAINT member_group_change_requests_reason_presence_check
    CHECK ((status = 'rejected') = (reason_category IS NOT NULL));
