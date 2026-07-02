import { prisma } from "./db";

type CreateTalkOptions = {
  scriptText: string;
  avatarUrl?: string | null;
  voiceId?: string | null;
  voiceStyle?: string | null;
  ssml?: boolean;
  stitch?: boolean;
  bgColor?: string | null;
  styleDegree?: number | null;
  padAudio?: number | null;
  elevenLabsVoiceId?: string | null;
  driverExpressions?: any | null;
};

type TalkResponse = {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  videoUrl?: string;
  error?: string;
};

// Mapeo fallback si hace falta
const DEFAULT_AVATARS = {
  male: "https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500",
  female: "https://images.pexels.com/photos/3763188/pexels-photo-3763188.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500",
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

    const voiceId = options.voiceId || "es-AR-TomasNeural";
    const isFemaleVoice =
      voiceId.toLowerCase().includes("elena") ||
      voiceId.toLowerCase().includes("dalia") ||
      voiceId.toLowerCase().includes("elvira");
    const fallbackGender = isFemaleVoice ? "female" : "male";

    let avatarUrl =
      options.avatarUrl ||
      process.env.DID_DEFAULT_AVATAR_URL ||
      DEFAULT_AVATARS[fallbackGender];

    // D-ID requiere estrictamente que la URL termine en jpg, jpeg o png.
    // Si la URL tiene parámetros query (ej. Unsplash), agregamos un parámetro ficticio al final.
    const lowerUrl = avatarUrl.toLowerCase();
    if (!lowerUrl.endsWith(".jpg") && !lowerUrl.endsWith(".jpeg") && !lowerUrl.endsWith(".png")) {
      if (avatarUrl.includes("?")) {
        avatarUrl = `${avatarUrl}&ext=.jpg`;
      } else {
        avatarUrl = `${avatarUrl}?ext=.jpg`;
      }
    }

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
      // Configurar proveedor de voz
      let providerPayload: any = {};
      if (options.elevenLabsVoiceId) {
        providerPayload = {
          type: "elevenlabs",
          voice_id: options.elevenLabsVoiceId,
        };
      } else {
        const voiceConfig: any = {};
        if (options.voiceStyle && options.voiceStyle !== "Default") {
          voiceConfig.style = options.voiceStyle;
        }
        if (options.styleDegree !== undefined && options.styleDegree !== null) {
          voiceConfig.style_degree = options.styleDegree;
        }

        providerPayload = {
          type: "microsoft",
          voice_id: voiceId,
          voice_config: Object.keys(voiceConfig).length > 0 ? voiceConfig : undefined,
        };
      }

      const configPayload: any = {
        fluent: false,
        pad_audio: options.padAudio !== undefined && options.padAudio !== null ? options.padAudio : 0.0,
        stitch: options.stitch !== undefined ? options.stitch : true,
      };

      if (options.bgColor) {
        configPayload.background = {
          color: options.bgColor,
        };
      }

      if (options.driverExpressions) {
        configPayload.driver_expressions = options.driverExpressions;
      }

      const response = await fetch("https://api.d-id.com/talks", {
        method: "POST",
        headers: this.getHeaders(apiKey!),
        body: JSON.stringify({
          source_url: avatarUrl,
          script: {
            type: "text",
            ssml: options.ssml || false,
            input: options.scriptText,
            provider: providerPayload,
          },
          config: configPayload,
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
          videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
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
