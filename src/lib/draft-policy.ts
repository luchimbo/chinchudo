// Política de uso de IA en el generador de borradores.
// En dry-run NO se llama a IA por defecto (evita gasto accidental).
// Solo el flag explícito --use-ai habilita la generación real durante un dry-run.
export function shouldUseAi(opts: { dryRun: boolean; useAi: boolean }): boolean {
  if (process.env.DISABLE_AI_DRAFTS === "true") return false;
  return !opts.dryRun || opts.useAi;
}
