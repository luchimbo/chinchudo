import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { markCopilotResponse, publishCopilotYouTubeResponse } from "@/app/(app)/opportunities/actions";
import { revalidatePath } from "next/cache";

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
    state.status = "DRAFTED";
    state.context = { copilot: { goal: "RESPONDER" } };
    state.responses[0] = { id: "response-1", editedText: "", approvedBy: "", isPrimary: false };
    state.responses[1] = { id: "response-2", editedText: "", approvedBy: "", isPrimary: true };
    state.publications = 0;
    vi.clearAllMocks();
  });

  it("archiva con el texto final y la respuesta principal, sin registrar publicación", async () => {
    await markCopilotResponse(responseForm());

    expect(state.status).toBe("ARCHIVED");
    expect(state.responses[0]).toMatchObject({ editedText: "Texto final editado", approvedBy: "CM", isPrimary: true });
    expect(state.responses[1].isPrimary).toBe(false);
    expect(state.context.copilot).toMatchObject({ goal: "RESPONDER", responseId: "response-1", wasEdited: true });
    expect((state.context.copilot as { respondedAt: string }).respondedAt).toBeTruthy();
    expect(state.publications).toBe(0);
    expect(revalidatePath).toHaveBeenCalledWith("/copiloto");
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
});
