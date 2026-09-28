"use client";

import { PendingSubmitButton } from "@/components/pending-submit-button";

type SubmitButtonProps = {
  children: React.ReactNode;
  loadingText?: string;
  className?: string;
  name?: string;
  value?: string;
};

export function SubmitButton({ children, loadingText, className, name, value }: SubmitButtonProps) {
  return <PendingSubmitButton loadingText={loadingText ?? "Guardando…"} className={className} name={name} value={value}>{children}</PendingSubmitButton>;
}
