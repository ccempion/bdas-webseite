"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button } from "@bdas/design-system";

import { approveAction, declineAction, type AdminActionState } from "./actions";

const initial: AdminActionState = {};

export function RowActions({ memberId }: { memberId: string }) {
  const [approveState, approve] = useFormState(approveAction, initial);
  const [declineState, decline] = useFormState(declineAction, initial);
  const error = approveState.error ?? declineState.error;
  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex gap-2">
        <form action={approve}>
          <input type="hidden" name="memberId" value={memberId} />
          <SubmitButton variant="primary" label="Freigeben" />
        </form>
        <form action={decline}>
          <input type="hidden" name="memberId" value={memberId} />
          <SubmitButton variant="ghost" label="Ablehnen" />
        </form>
      </div>
      {error ? (
        <Alert variant="error" className="w-full">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}

function SubmitButton({ variant, label }: { variant: "primary" | "ghost"; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}
