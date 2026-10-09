"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ComponentProps } from "react";
import { LoadingSpinner } from "./loading-ui";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

/** Mantiene visible el destino mientras Next prepara la siguiente pantalla. */
export function PendingNavigationLink({ href, children, onClick, scroll, ...props }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Link {...props} href={href} scroll={scroll} aria-busy={pending} onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.currentTarget.hasAttribute("download") || (event.currentTarget.target && event.currentTarget.target !== "_self")) return;
      event.preventDefault();
      if (pending) return;
      startTransition(() => router.push(href, { scroll }));
    }}>
      {children}
      {pending ? <span role="status" className="ml-2 inline-flex align-middle"><LoadingSpinner /><span className="sr-only">Cargando…</span></span> : null}
    </Link>
  );
}
