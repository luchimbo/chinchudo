import { prisma } from "@/lib/db";

/**
 * Lee un valor de configuración persistido en la tabla AppSetting.
 * Devuelve null si la clave no existe.
 */
export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

/** Inserta o actualiza un valor de configuración en AppSetting. */
export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
}

/**
 * URL actual del relay de agentes. Vive en la DB (la escribe el script de
 * arranque local cada vez que cambia el túnel trycloudflare), con fallback al
 * env AGENT_RELAY_URL por compatibilidad.
 */
export async function getRelayUrl(): Promise<string | undefined> {
  const fromDb = await getSetting("AGENT_RELAY_URL");
  return fromDb?.trim() || process.env.AGENT_RELAY_URL?.trim() || undefined;
}

/**
 * Por dónde llega la web a la IA local. Primero el túnel del servidor pcmidi (donde
 * corre Ollama; lo publica blog-runtime-service.mjs y no depende de la PC de PC MIDI),
 * después el relay de la PC como respaldo.
 */
export async function getLocalLlmRelayUrl(): Promise<string | undefined> {
  const server = await getSetting("blog_runtime_relay_url");
  return server?.trim() || await getRelayUrl();
}
