import { z } from "zod";

const MAX_MESSAGE_LENGTH = 1_500;

function cleanText(value: string, maxLength: number): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export const clientErrorReportSchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  name: z.string().trim().max(120).optional(),
  digest: z.string().trim().max(200).optional(),
  path: z.string().trim().regex(/^\//, "La ruta debe comenzar con '/'.").max(500),
});

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

export function buildClientErrorLog(report: ClientErrorReport, username: string) {
  const errorName = cleanText(report.name || "Error", 120) || "Error";
  const message = cleanText(report.message, MAX_MESSAGE_LENGTH) || "Error sin mensaje";
  const digest = cleanText(report.digest || "", 200);

  return {
    event: "client_render_error",
    message: `${errorName} en ${report.path}: ${message}`,
    meta: {
      path: report.path,
      errorName,
      digest,
      reporter: username,
      source: "next_error_boundary",
    },
  };
}
