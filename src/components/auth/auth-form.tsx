"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuthFormState } from "@/app/(auth)/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block loading={pending}>
      {label}
    </Button>
  );
}

export function AuthForm({
  action,
  submitLabel,
  children,
}: {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger-500/30 bg-danger-50 px-4 py-3 text-sm text-danger-700"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </div>
      ) : null}

      {state.success ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.success}</span>
        </div>
      ) : null}

      {children}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
