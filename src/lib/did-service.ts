import { prisma } from "./db";

type CreateTalkOptions = {
  scriptText: string;
  avatarUrl?: string | null;
  personaName: string;
};

type TalkResponse = {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  videoUrl?: string;
  error?: string;
};

// Mapeo de Personas de Los 5 Apóstoles a voces de Microsoft en D-ID (Argentina/LATAM)
const PERSONA_VOICE_MAP: Record<string, { voice_id: string; gender: "male" | "female" }> = {
  "Técnico / Productor": { voice_id: "es-AR-TomasNeural", gender: "male" },
  "Baterista de Departamento": { voice_id: "es-AR-TomasNeural", gender: "male" },
  "Trend-Setter Kressmer": { voice_id: "es-AR-ElenaNeural", gender: "female" },
  "Profe / Madre-Padre": { voice_id: "es-AR-ElenaNeural", gender: "female" },
  "Cazador de Ofertas": { voice_id: "es-AR-TomasNeural", gender: "male" },
};

const DEFAULT_AVATARS = {
  male: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=400",
  female: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=400",
};

export class DIDService {
  private static getHeaders(apiKey: string) {
    // D-ID usa Basic Auth codificando la clave de API directamente
    const authHeader = `Basic ${Buffer.from(apiKey + ":").toString("base64")}`;
    return {
      Authorization: authHeader,
      "Content-Type": "application/json",
    };
  }

  /**
   * Envía una solicitud a D-ID para generar un video animado (Talk).
   */
  static async createTalk(options: CreateTalkOptions): Promise<TalkResponse> {
    const apiKey = process.env.DID_API_KEY?.trim();
    const isMock = !apiKey || apiKey === "mock";

    const voiceConfig = PERSONA_VOICE_MAP[options.personaName] || {
      voice_id: "es-AR-TomasNeural",
      gender: "male",
    };

    const avatarUrl =
      options.avatarUrl ||
      process.env.DID_DEFAULT_AVATAR_URL ||
      DEFAULT_AVATARS[voiceConfig.gender];

    if (isMock) {
      console.log("[D-ID Service] Iniciando en Modo MOCK");
      // Generar un ID ficticio para simular la tarea
      const mockId = `mock_talk_${Date.now()}`;
      return {
        id: mockId,
        status: "PROCESSING",
      };
    }

    try {
      const response = await fetch("https://api.d-id.com/talks", {
        method: "POST",
        headers: this.getHeaders(apiKey!),
        body: JSON.stringify({
          source_url: avatarUrl,
          script: {
            type: "text",
            input: options.scriptText,
            provider: {
              type: "microsoft",
              voice_id: voiceConfig.voice_id,
            },
          },
          config: {
            fluent: false,
            pad_audio: 0.0,
            stitch: true,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[D-ID API Error] HTTP ${response.status}:`, errorText);
        return {
          id: "",
          status: "FAILED",
          error: `D-ID API Error (HTTP ${response.status}): ${errorText}`,
        };
      }

      const data = (await response.json()) as { id: string; status: string; error?: any };
      return {
        id: data.id,
        status: "PROCESSING",
      };
    } catch (err: any) {
      console.error("[D-ID Service] Excepción en createTalk:", err);
      return {
        id: "",
        status: "FAILED",
        error: err.message || String(err),
      };
    }
  }

  /**
   * Consulta el estado de procesamiento de un Talk en D-ID.
   */
  static async getTalkStatus(talkId: string): Promise<TalkResponse> {
    const apiKey = process.env.DID_API_KEY?.trim();
    const isMock = !apiKey || apiKey === "mock" || talkId.startsWith("mock_");

    if (isMock) {
      // Simular que el video se renderiza al cabo de unos segundos
      const ageMs = Date.now() - parseInt(talkId.replace("mock_talk_", "") || "0");
      if (ageMs > 8000) {
        // Después de 8 segundos, simulamos éxito
        return {
          id: talkId,
          status: "COMPLETED",
          // Usamos un video de test público
          videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
        };
      }
      return {
        id: talkId,
        status: "PROCESSING",
      };
    }

    try {
      const response = await fetch(`https://api.d-id.com/talks/${talkId}`, {
        method: "GET",
        headers: this.getHeaders(apiKey!),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[D-ID API Error] HTTP ${response.status} en GET status:`, errorText);
        return {
          id: talkId,
          status: "FAILED",
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const data = (await response.json()) as {
        id: string;
        status: "created" | "started" | "done" | "rejected" | "error";
        result_url?: string;
        error?: { message: string };
      };

      let status: TalkResponse["status"] = "PROCESSING";
      if (data.status === "done" && data.result_url) {
        status = "COMPLETED";
      } else if (data.status === "rejected" || data.status === "error") {
        status = "FAILED";
      }

      return {
        id: talkId,
        status,
        videoUrl: data.result_url,
        error: data.error?.message,
      };
    } catch (err: any) {
      console.error("[D-ID Service] Excepción en getTalkStatus:", err);
      return {
        id: talkId,
        status: "FAILED",
        error: err.message || String(err),
      };
    }
  }
}
