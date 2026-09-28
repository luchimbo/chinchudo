"use client";

import { createContext, useContext, useState } from "react";
import type { ButtonHTMLAttributes, FormHTMLAttributes, ReactNode } from "react";
import { LoadingSpinner } from "./loading-ui";

const PendingContext = createContext(false);

export function NativePendingForm({ children, onSubmit, ...props }: FormHTMLAttributes<HTMLFormElement> & { children: ReactNode }) {
  const [pending, setPending] = useState(false);
  return <PendingContext.Provider value={pending}><form {...props} onSubmit={(event) => { onSubmit?.(event); if (!event.defaultPrevented) setPending(true); }}>{children}</form></PendingContext.Provider>;
}

export function NativePendingButton({ children, loadingText = "Procesando…", disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; loadingText?: string }) {
  const pending = useContext(PendingContext);
  return <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending}>
    {pending ? <span role="status" className="inline-flex items-center gap-2"><LoadingSpinner />{loadingText}</span> : children}
  </button>;
}
