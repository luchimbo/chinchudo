import { z } from "zod";

// Vercel Functions limita el cuerpo de la petición a 4,5 MB; dejamos margen para multipart.
export const ISSUE_IMAGE_MAX_SIZE = 4 * 1024 * 1024;
export const ISSUE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export function getIssueSector(originPath: string): string {
  const pathname = originPath.split("?", 1)[0];
  if (pathname === "/") return "Inicio";
  if (pathname.startsWith("/landings") || pathname.startsWith("/leads")) return "Creador de landings";
  if (pathname.startsWith("/videos")) return "Tendencias y guiones";
  if (["/oportunidades", "/bitacora", "/historial", "/distribution", "/actividad", "/redes"].some((path) => pathname.startsWith(path))) return "Publicador en Redes";
  if (["/analytics", "/informe", "/geo"].some((path) => pathname.startsWith(path))) return "Analíticas";
  if (["/configuracion", "/brands", "/products", "/personas", "/prompts", "/knowledge", "/clients"].some((path) => pathname.startsWith(path))) return "Configuración";
  return "Suite";
}

export const createIssueReportSchema = z.object({
  description: z.string().trim().min(1, "Contá qué problema encontraste.").max(4000),
  originPath: z.string().trim().regex(/^\//, "La pantalla de origen no es válida.").max(500),
  imageUrl: z.string().url().max(2000).optional().or(z.literal("")),
});

export const updateIssueReportSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "RESOLVED"]),
});
