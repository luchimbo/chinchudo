"use client";
import { useState } from "react";
import Link from "next/link";
import { useVisiblePoll } from "@/lib/use-visible-poll";
export function AgentConnectionStatus({ client }: { client: string }) {
  const [issues, setIssues] = useState<string[] | null>(null);
  useVisiblePoll<{ issues: string[] }>(`/api/blog/connection?client=${encodeURIComponent(client)}`, result => setIssues(result.issues), false);
  if (issues === null) return <p className="mb-3 text-xs text-slate" role="status">Comprobando conexión del agente…</p>;
  return issues.length ? <div role="status" className="mb-3 space-y-1 rounded-lg border border-brass/25 bg-brass/5 px-3 py-2 text-xs text-ink">
    {issues.map(issue => <p key={issue}>{issue}</p>)}
    <Link className="underline" href={`/blog/configuracion?client=${encodeURIComponent(client)}`}>Ver configuración</Link>
  </div> : null;
}
