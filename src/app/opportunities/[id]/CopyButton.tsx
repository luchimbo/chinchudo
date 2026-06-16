"use client";

import { useState } from "react";

type CopyButtonProps = {
  text: string;
  className?: string;
};

export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Texto copiado al portapapeles" : "Copiar texto aprobado al portapapeles"}
      aria-pressed={copied}
      className={
        className ??
        "w-full rounded-full border border-ink/20 bg-paper px-5 py-3 text-sm font-bold text-ink transition hover:border-ink/45 hover:bg-white"
      }
    >
      {copied ? "Copiado ✓" : "Copiar texto aprobado"}
    </button>
  );
}
