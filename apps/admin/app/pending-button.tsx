"use client";

import { useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function PendingButton({ children, pendingText = "Procesando…", disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending}>
    {pending ? <span role="status" className="admin-pending"><span className="admin-spinner" aria-hidden="true" />{pendingText}</span> : children}
  </button>;
}

export function LogoutForm() {
  const [pending, setPending] = useState(false);
  return <form action="/api/auth/logout" method="POST" onSubmit={() => setPending(true)}>
    <button className="button secondary" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? <span role="status" className="admin-pending"><span className="admin-spinner" aria-hidden="true" />Saliendo…</span> : "Cerrar sesión"}
    </button>
  </form>;
}
