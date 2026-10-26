export type BlogTaskError = { code: string; message: string; action: "connection" | "retry-generation" | "edit" | "reschedule" | "retry-publication" | "detail"; label: string };
export function blogTaskError(code: string, raw: string, hasArticle: boolean): BlogTaskError | null {
  if (!raw && !code) return null;
  if (/seo_title duplicado/i.test(raw)) return { code, message: "Hay títulos SEO duplicados. Revisá las versiones del artículo y corregí o archivá la copia repetida.", action: hasArticle ? "edit" : "detail", label: "Revisar versiones" };
  const errors: Record<string, Omit<BlogTaskError, "code">> = {
    CONNECTION: { message: "No se pudo conectar con el agente local.", action: "connection", label: "Revisar conexión" },
    GENERATION_FAILED: { message: "No se pudo preparar el artículo.", action: "retry-generation", label: "Reintentar preparación" },
    GENERATION_INTERRUPTED: { message: "La preparación se interrumpió.", action: "retry-generation", label: "Reintentar preparación" },
    QUALITY_BLOCKED: { message: "El artículo necesita correcciones de calidad o fuentes.", action: "edit", label: "Corregir artículo" },
    DATE_INCOMPATIBLE: { message: "El tipo de artículo no corresponde a esta fecha.", action: "reschedule", label: "Reprogramar" },
    DEPLOYMENT_FAILED: { message: "No se pudo desplegar y verificar la publicación.", action: "retry-publication", label: "Reintentar publicación" },
  };
  const error = errors[code];
  if (!error || (error.action === "retry-generation" && hasArticle) || (["edit", "retry-publication"].includes(error.action) && !hasArticle)) return { code, message: "La tarea necesita revisión.", action: "detail", label: "Ver detalle" };
  return { code, ...error };
}
