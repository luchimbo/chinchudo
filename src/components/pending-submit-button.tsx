"use client";

import { useId, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoadingSpinner } from "./loading-ui";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; loadingText?: string };

export function PendingSubmitButton({ children, loadingText = "Procesando…", disabled, className = "", onClick, ...props }: Props) {
  const { pending } = useFormStatus();
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const activeSubmitter = ref.current?.form?.dataset.pendingSubmitter;
  const showProgress = pending && (!activeSubmitter || activeSubmitter === id);
  return <button {...props} ref={ref} type="submit" disabled={disabled || pending} aria-busy={showProgress} className={`${className} disabled:cursor-wait disabled:opacity-60`} onClick={(event) => {
    onClick?.(event);
    if (!event.defaultPrevented && event.currentTarget.form) event.currentTarget.form.dataset.pendingSubmitter = id;
  }}>
    {showProgress ? <span role="status" className="inline-flex items-center gap-2"><LoadingSpinner />{loadingText}</span> : children}
  </button>;
}
