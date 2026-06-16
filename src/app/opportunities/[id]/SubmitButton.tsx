"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: React.ReactNode;
  loadingText?: string;
  className?: string;
  name?: string;
  value?: string;
};

export function SubmitButton({ children, loadingText, className, name, value }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      name={name}
      value={value}
      className={className}
    >
      {pending ? (loadingText ?? "Guardando…") : children}
    </button>
  );
}
