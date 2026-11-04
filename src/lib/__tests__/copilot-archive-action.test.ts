import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  status: "DRAFTED",
  context: {} as Record<string, unknown>,
  responses: [
    { id: "response-1", editedText: "", approvedBy: "", isPrimary: false },
    { id: "response-2", editedText: "", approvedBy: "", isPrimary: true },
  ],
  publications: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/cm-action-guard", () => ({
  assertCurrentCMResponse: vi.fn(async () => {}),
  claimYouTubePublication: vi.fn(async () => { if (state.context.cmPublicationPending) return false; state.context.cmPublicationPending = true; return true; }),
  clearYouTubePublication: vi.fn(async () => { delete state.context.cmPublicationPending; return true; }),
  markYouTubePublicationAmbiguous: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth-guards", () => ({ requireOwnedClientId: vi.fn(async () => ({ id: "client-1" })) }));
vi.mock("@/lib/auth", () => ({ assertClientAccess: vi.fn(async () => {}) }));
vi.mock("@/lib/publish-agent", () => ({
  checkPublishRateLimits: vi.fn(async () => ({ ok: true })),
  closeSiblingOpportunities: vi.fn(async () => 0),
  runPublisher: vi.fn(),
}));
vi.mock("@/lib/youtube-publisher", () => ({
  publishYouTubeComment: vi.fn(async () => ({ success: true, url: "https://youtube.com/watch?v=test", remoteId: "remote-1", method: "youtube_api" })),
}));
vi.mock("@/lib/db", () => {
  const prisma = {
    response: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        opportunityId: where.id === "response-1" ? "opportunity-1" : "another-opportunity",
        chatHistory: [],
        brand: { name: "Marca" },
        opportunity: { clientId: "client-1", sourceText: "Consulta original" },
      })),
      updateMany: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
    },
    opportunity: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: "opportunity-1", clientId: "client-1", channelId: "channel-1", sourceUrl: "https://youtube.com/watch?v=test",
        status: state.status, contextAssessment: state.context, channel: { name: "YouTube" },
      })),
      update: vi.fn(async ({ data }: { data: { status: string } }) => { state.status = data.status; }),
    },
    publishingLog: { upsert: vi.fn(async () => { state.publications += 1; }) },
    $transaction: vi.fn(async (run: ((tx: unknown) => Promise<void>) | Promise<unknown>[]) => Array.isArray(run) ? Promise.all(run) : run({
      opportunity: {
        updateMany: async ({ where, data }: { where: { status: { in: string[] } }; data: { status: string; contextAssessment: Record<string, unknown> } }) => {
          if (!where.status.in.includes(state.status)) return { count: 0 };
          state.status = data.status;
          state.context = data.contextAssessment;
          return { count: 1 };
        },
      },
      response: {
        updateMany: async ({ where }: { where: { id: { not: string } } }) => {
          state.responses.filter((response) => response.id !== where.id.not).forEach((response) => { response.isPrimary = false; });
        },
        update: async ({ where, data }: { where: { id: string }; data: { editedText: string; approvedBy: string; isPrimary: boolean } }) => {
          Object.assign(state.responses.find((response) => response.id === where.id)!, data);
        },
      },
    })),
  };
  return { prisma };
});

import { confirmYouTubeNotPublished, markCopilotResponse, publishCopilotYouTubeResponse } from "@/app/(app)/opportunities/actions";
import { assertCurrentCMResponse, clearYouTubePublication } from "@/lib/cm-action-guard";
import { revalidatePath } from "next/cache";
import { publishYouTubeComment } from "@/lib/youtube-publisher";
import { prisma } from "@/lib/db";

function responseForm(responseId = "response-1") {
  const form = new FormData();
  form.set("opportunityId", "opportunity-1");
  form.set("responseId", responseId);
  form.set("editedText", "Texto final editado");
  form.set("wasEdited", "true");
  return form;
}

describe("Guardar como respondida en Copiloto", () => {
  beforeEach(() => {
    vi.stubEnv("OPTIMIZED_LOADING", "false");
    state.status = "DRAFTED";
    state.context = { copilot: { goal: "RESPONDER" } };
    state.responses[0] = { id: "response-1", editedText: "", approvedBy: "", isPrimary: false };
    state.responses[1] = { id: "response-2", editedText: "", approvedBy: "", isPrimary: true };
    state.publications = 0;
    vi.clearAllMocks();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("archiva con el texto final y la respuesta principal, sin registrar publicación", async () => {
    await markCopilotResponse(responseForm());

    expect(state.status).toBe("ARCHIVED");
    expect(state.responses[0]).toMatchObject({ editedText: "Texto final editado", approvedBy: "CM", isPrimary: true });
    expect(state.responses[1].isPrimary).toBe(false);
    expect(state.context.copilot).toMatchObject({ goal: "RESPONDER", responseId: "response-1", wasEdited: true });
    expect((state.context.copilot as { respondedAt: string }).respondedAt).toBeTruthy();
    expect(state.publications).toBe(0);
    expect(revalidatePath).toHaveBeenCalledWith("/asistente-cm");
    expect(revalidatePath).toHaveBeenCalledWith("/historial");
  });

  it("rechaza un segundo envío sin modificar la respuesta archivada", async () => {
    await markCopilotResponse(responseForm());
    const archivedAt = (state.context.copilot as { respondedAt: string }).respondedAt;

    await expect(markCopilotResponse(responseForm())).rejects.toThrow("ya fue respondida");
    expect(state.status).toBe("ARCHIVED");
    expect((state.context.copilot as { respondedAt: string }).respondedAt).toBe(archivedAt);
    expect(state.publications).toBe(0);
  });
  it("actualiza la tarjeta sin recargar CM cuando la carga optimizada está activa", async () => {
    vi.stubEnv("OPTIMIZED_LOADING", "true");
    await markCopilotResponse(responseForm());
    expect(state.status).toBe("ARCHIVED");
    expect(revalidatePath).not.toHaveBeenCalledWith("/asistente-cm");
    expect(revalidatePath).toHaveBeenCalledWith("/historial");
  });

  it("rechaza una respuesta de otra oportunidad antes de archivarla", async () => {
    await expect(markCopilotResponse(responseForm("response-2"))).rejects.toThrow("no corresponde");
    expect(state.status).toBe("DRAFTED");
    expect(state.publications).toBe(0);
  });

  it("mantiene la publicación de YouTube separada del archivo", async () => {
    const form = responseForm();
    form.set("account", "youtube-principal");
    await publishCopilotYouTubeResponse(form);

    expect(state.status).toBe("PUBLISHED");
    expect(state.publications).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith("/historial");
  });

  it("pide reconectar YouTube sin cerrar la oportunidad si el token fue revocado", async () => {
    vi.mocked(publishYouTubeComment).mockResolvedValueOnce({ success: false, error: "Token has been expired or revoked.", method: "failed" });
    const form = responseForm();
    form.set("account", "youtube-principal");

    const result = await publishCopilotYouTubeResponse(form);

    expect(result).toMatchObject({ success: false, reconnectRequired: true });
    expect(state.status).toBe("DRAFTED");
    expect(state.publications).toBe(0);
  });
  it("bloquea otro envío cuando el resultado remoto quedó ambiguo", async () => {
    vi.mocked(publishYouTubeComment).mockResolvedValueOnce({ success: false, error: "timeout", ambiguous: true, method: "failed" });
    const form = responseForm(); form.set("account", "youtube-principal");
    expect(await publishCopilotYouTubeResponse(form)).toMatchObject({ success: false, verificationRequired: true });
    expect(await publishCopilotYouTubeResponse(form)).toMatchObject({ success: false, verificationRequired: true });
    expect(publishYouTubeComment).toHaveBeenCalledTimes(1);
    expect(state.status).toBe("DRAFTED"); expect(state.publications).toBe(0);
  });
  it("una propuesta desactualizada no llega a la API de publicación", async () => {
    vi.stubEnv("OPTIMIZED_LOADING", "true");
    vi.mocked(assertCurrentCMResponse).mockRejectedValueOnce(new Error("stale"));
    const form = responseForm(); form.set("account", "youtube-principal");
    expect(await publishCopilotYouTubeResponse(form)).toMatchObject({ success: false });
    expect(publishYouTubeComment).not.toHaveBeenCalled();
  });
  it("no habilita un reintento sin la comprobación humana explícita", async () => {
    const form = responseForm();
    await expect(confirmYouTubeNotPublished(form)).rejects.toThrow("Revisá primero");
    expect(clearYouTubePublication).not.toHaveBeenCalled();
    form.set("verifiedNotPublished", "true");
    expect(await confirmYouTubeNotPublished(form)).toMatchObject({ success: true });
    expect(publishYouTubeComment).not.toHaveBeenCalled();
  });
  it("si falla la persistencia después de publicar conserva el bloqueo", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("database unavailable"));
    vi.mocked(prisma.opportunity.update).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.publishingLog.upsert).mockResolvedValueOnce({} as never);
    const form = responseForm(); form.set("account", "youtube-principal");
    await expect(publishCopilotYouTubeResponse(form)).rejects.toThrow("database unavailable");
    expect(await publishCopilotYouTubeResponse(form)).toMatchObject({ success: false, verificationRequired: true });
    expect(publishYouTubeComment).toHaveBeenCalledTimes(1);
    expect(state.publications).toBe(0);
  });
});
