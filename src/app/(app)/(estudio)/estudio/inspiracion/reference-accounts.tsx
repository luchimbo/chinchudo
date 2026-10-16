"use client";

import { useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { LoadingSpinner } from "@/components/loading-ui";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Chip, primaryButton, secondaryButton, smallButton } from "@/components/studio/ui";
import { PLATFORM_LABEL, REFERENCE_KIND_LABEL, REFERENCE_MAX, REFERENCE_MIN, type ReferenceKind, type ReferencePlatform } from "@/lib/studio/reference-accounts";
import { addReferenceAccountAction, removeReferenceAccount, requestReferenceScan, toggleReferenceAccount, type ActionState } from "../actions";

export type AccountRow = { id: string; platform: string; handle: string; url: string; kind: string; active: boolean; medianViews: number | null; lastScannedAt: string | null; scanRequestedAt: string | null; lastError: string; reels: number };

function since(iso: string | null) {
  if (!iso) return null;
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return days === 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} días`;
}

function AccountItem({ account }: { account: AccountRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const run = (task: () => Promise<ActionState>) => startTransition(async () => { const result = await task(); setError(result.error ?? ""); });
  const kind = REFERENCE_KIND_LABEL[account.kind as ReferenceKind];
  const scanned = since(account.lastScannedAt);
  const waiting = account.scanRequestedAt && (!account.lastScannedAt || account.scanRequestedAt > account.lastScannedAt);
  return <li className={`flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row sm:items-center ${account.active ? "border-ink/10" : "border-dashed border-ink/15 opacity-60"}`}>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <a href={account.url} target="_blank" rel="noreferrer" className="font-bold underline decoration-ink/20 underline-offset-4">@{account.handle}</a>
        <Chip>{PLATFORM_LABEL[account.platform as ReferencePlatform] ?? account.platform}</Chip>
        {kind && <Chip tone="bg-brass/10 text-brass">{kind.label}</Chip>}
        {!account.active && <Chip>Pausada</Chip>}
      </div>
      <p className="mt-1 text-xs text-slate">
        {account.lastError ? <span className="text-signal">No se pudo leer: {account.lastError}</span>
          : scanned ? `Leída ${scanned} · ${account.reels} videos${account.medianViews ? ` · suele tener ${new Intl.NumberFormat("es-AR", { notation: "compact" }).format(account.medianViews)} vistas` : ""}`
          : "Todavía no la leímos."}
        {waiting && !account.lastError ? " · En cola para leer." : ""}
      </p>
      {error && <p role="alert" className="mt-1 text-xs text-signal">{error}</p>}
    </div>
    <div className="flex items-center gap-2">
      {pending && <LoadingSpinner />}
      <button type="button" disabled={pending} onClick={() => run(() => toggleReferenceAccount(account.id))} className={smallButton}>{account.active ? "Pausar" : "Activar"}</button>
      <button type="button" disabled={pending} onClick={() => run(() => removeReferenceAccount(account.id))} aria-label={`Quitar @${account.handle}`} className={`${smallButton} text-signal`}>Quitar</button>
    </div>
  </li>;
}

export function ReferenceAccounts({ clientId, accounts }: { clientId: string; accounts: AccountRow[] }) {
  const [state, action] = useFormState<ActionState, FormData>(addReferenceAccountAction, { error: null });
  const [scanState, setScanState] = useState<ActionState>({ error: null });
  const [scanning, startScan] = useTransition();
  const active = accounts.filter((account) => account.active).length;
  const field = "h-11 rounded-md border border-ink/15 bg-white px-3 text-sm";

  return <div className="space-y-6">
    <div className="rounded-2xl border border-ink/10 bg-white p-5">
      <h2 className="font-display text-xl font-bold">¿A quién mirás?</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate">Sumá entre {REFERENCE_MIN} y {REFERENCE_MAX} cuentas: unas 4 de competencia, 4 afines (mismo público, otro rubro) y un par grandes solo por cómo graban. Leemos sus últimos videos y comparamos cada uno con lo que esa cuenta suele hacer: así sabés qué funcionó de verdad.</p>
      <form action={action} className="mt-4 grid gap-3 md:grid-cols-[1fr_10rem_12rem_auto] md:items-end">
        <input type="hidden" name="clientId" value={clientId} />
        <label className="grid gap-1.5 text-sm font-bold">Link del perfil o @usuario<input name="account" required placeholder="https://www.instagram.com/cuenta/" className={field} /></label>
        <label className="grid gap-1.5 text-sm font-bold">Red<select name="platform" className={field}>{(["INSTAGRAM", "TIKTOK", "YOUTUBE"] as ReferencePlatform[]).map((platform) => <option key={platform} value={platform}>{PLATFORM_LABEL[platform]}</option>)}</select></label>
        <label className="grid gap-1.5 text-sm font-bold">Tipo<select name="kind" className={field}>{(Object.keys(REFERENCE_KIND_LABEL) as ReferenceKind[]).map((kind) => <option key={kind} value={kind}>{REFERENCE_KIND_LABEL[kind].label} · {REFERENCE_KIND_LABEL[kind].hint}</option>)}</select></label>
        <PendingSubmitButton className={primaryButton} loadingText="Agregando…">Agregar</PendingSubmitButton>
      </form>
      {state.message && <p role="status" className="mt-2 text-sm font-bold text-moss">✓ {state.message}</p>}
      {state.error && <p role="alert" className="mt-2 text-sm text-signal">{state.error}</p>}
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-bold">{active} de {REFERENCE_MIN}–{REFERENCE_MAX} cuentas activas{active < REFERENCE_MIN ? <span className="font-normal text-slate"> · con menos de {REFERENCE_MIN} la comparación es pobre</span> : null}</p>
      {accounts.length > 0 && <button type="button" disabled={scanning} onClick={() => startScan(async () => setScanState(await requestReferenceScan(clientId)))} className={secondaryButton}>{scanning ? <LoadingSpinner /> : null}Leer ahora</button>}
    </div>
    {scanState.message && <p role="status" className="-mt-4 text-sm text-moss">{scanState.message}</p>}
    {scanState.error && <p role="alert" className="-mt-4 text-sm text-signal">{scanState.error}</p>}
    {accounts.length ? <ul className="space-y-2">{accounts.map((account) => <AccountItem key={account.id} account={account} />)}</ul> : <p className="rounded-2xl border border-dashed border-ink/20 bg-white/60 p-8 text-center text-sm text-slate">Todavía no sumaste cuentas. Empezá por las 2 o 3 que más mirás de tu rubro.</p>}
  </div>;
}
