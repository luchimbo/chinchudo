"use client";

import { useFormState } from "react-dom";
import type { ProductFormState } from "./actions";

// Envuelve el alta y la edición: si la acción devuelve un error (por ejemplo, un nombre
// repetido), se muestra acá y los campos conservan lo que se escribió.
export function ProductForm({ action, className, children }: {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  className: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useFormState(action, { error: null });
  return <form action={formAction} className={className}>
    {children}
    {state.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-2">{state.error}</p> : null}
  </form>;
}
