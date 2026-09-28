import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  status: "APPROVED",
  connections: [{ account: "youtube-principal" }] as { account: string }[],
  loggedAccount: null as string | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`); }),
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
vi.mock("@/lib/db", () => ({
  prisma: {
    opportunity: {
      findUniqueOrThrow: vi.fn(async () => ({
        status: state.status, clientId: "client-1", channelId: "channel-1",
        sourceUrl: "https://youtube.com/watch?v=test", channel: { name: "YouTube" },
      })),
      update: vi.fn(async ({ data }: { data: { status: string } }) => { state.status = data.status; }),
    },
    response: {
      findFirst: vi.fn(async () => ({ id: "response-1", approvedBy: "Operador", editedText: "", draftText: "Borrador aprobado" })),
      update: vi.fn(async () => {}),
    },
    youTubeConnection: { findMany: vi.fn(async () => state.connections) },
    publishingLog: {
      upsert: vi.fn(async ({ create }: { create: { account: string } }) => { state.loggedAccount = create.account; }),
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  },
}));

import { publishViaAgent } from "@/app/(app)/opportunities/actions";
import { publishYouTubeComment } from "@/lib/youtube-publisher";

function publishForm(account: string) {
  const form = new FormData();
  form.set("opportunityId", "opportunity-1");
  form.set("responseId", "response-1");
  form.set("account", account);
  return form;
}

describe("Publicar en YouTube desde el detalle de oportunidad", () => {
  beforeEach(() => {
    state.status = "APPROVED";
    state.connections = [{ account: "youtube-principal" }];
    state.loggedAccount = null;
    vi.clearAllMocks();
  });

  it("usa la conexión OAuth del cliente aunque una pestaña vieja mande un perfil de navegador", async () => {
    await expect(publishViaAgent(publishForm("cazador-ofertas"))).rejects.toThrow("agentOk=1");

    expect(vi.mocked(publishYouTubeComment).mock.calls[0][0]).toMatchObject({ clientId: "client-1", account: "youtube-principal" });
    expect(state.loggedAccount).toBe("youtube-principal");
    expect(state.status).toBe("PUBLISHED");
  });

  it("vuelve a la oportunidad pidiendo reconectar si Google revocó el token", async () => {
    vi.mocked(publishYouTubeComment).mockResolvedValueOnce({ success: false, error: "Token has been expired or revoked.", method: "failed" });

    await expect(publishViaAgent(publishForm("youtube-principal"))).rejects.toThrow("agentError=youtube_reconnect");

    expect(state.status).toBe("APPROVED");
    expect(state.loggedAccount).toBeNull();
  });

  it("pide conectar YouTube sin intentar publicar si el cliente no tiene conexión", async () => {
    state.connections = [];

    await expect(publishViaAgent(publishForm("youtube-principal"))).rejects.toThrow("agentError=youtube_reconnect");

    expect(publishYouTubeComment).not.toHaveBeenCalled();
    expect(state.status).toBe("APPROVED");
  });
});
