import { prisma } from "./db";

type CreateVideoOptions = {
  scriptText: string;
  avatarId?: string | null;
  voiceId?: string | null;
  aspectRatio?: "9:16" | "16:9";
};

type HeyGenVideoResponse = {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  videoUrl?: string;
  error?: string;
};

// Mapeo inteligente de voces Microsoft a voces nativas de HeyGen para no romper semillas
const VOICE_MAPPING: Record<string, string> = {
  "es-AR-TomasNeural": "21m00Tcm4TlvDq8ikWAM", // Usar una voz masculina de español neutro de alta calidad
  "es-AR-ElenaNeural": "EXAVITQu4vr4xnSDxMaL", // Usar una voz femenina de español de alta calidad
  "es-MX-JorgeNeural": "5a7ab6c78e124ef1915993e36e1c4e78", // Stock HeyGen
  "es-MX-DaliaNeural": "2e06180a373d4fc2bdf6b5c3e3a5ee99", // Stock HeyGen
  "es-ES-AlvaroNeural": "e58b1ab6972d4ecfbdf6b3c3e2e5ee88", // Stock HeyGen
  "es-ES-ElviraNeural": "1a76180d383d4fc2bdf6b5c3e3a5ee00", // Stock HeyGen
};

const DEFAULT_AVATARS = {
  male: "josh_lite_20230714",
  female: "cynthia_lite_20230714",
};

export class HeyGenService {
  private static getHeaders(apiKey: string) {
    return {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    };
  }

  /**
   * Genera un video con Avatar usando la API de HeyGen
   */
  static async createVideo(options: CreateVideoOptions): Promise<HeyGenVideoResponse> {
    const apiKey = process.env.HEYGEN_API_KEY?.trim();
    const isMock = !apiKey || apiKey === "mock";

    // 1. Mapear y sanear el Voice ID
    let finalVoiceId = options.voiceId || "21m00Tcm4TlvDq8ikWAM";
    if (VOICE_MAPPING[finalVoiceId]) {
      finalVoiceId = VOICE_MAPPING[finalVoiceId];
    }

    // 2. Mapear y sanear el Avatar ID (si antes era una URL, usar stock avatar)
    let avatarId = options.avatarId || "";
    const isUrl = avatarId.startsWith("http://") || avatarId.startsWith("https://") || avatarId.startsWith("/");
    
    if (!avatarId || isUrl) {
      const voiceLower = (options.voiceId || "").toLowerCase();
      const isFemale = voiceLower.includes("elena") || voiceLower.includes("dalia") || voiceLower.includes("elvira");
      avatarId = isFemale ? DEFAULT_AVATARS.female : DEFAULT_AVATARS.male;
    }

    if (isMock) {
      console.log("[HeyGen Service] Generando en Modo MOCK");
      const mockId = `mock_heygen_${Date.now()}`;
      return {
        id: mockId,
        status: "PROCESSING",
      };
    }

    try {
      const response = await fetch("https://api.heygen.com/v3/videos", {
        method: "POST",
        headers: this.getHeaders(apiKey!),
        body: JSON.stringify({
          type: "avatar",
          avatar_id: avatarId,
          voice_id: finalVoiceId,
          script: options.scriptText,
          aspect_ratio: options.aspectRatio || "9:16",
          resolution: "1080p",
          engine: "avatar_v",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[HeyGen API Error] HTTP ${response.status}:`, errorText);
        return {
          id: "",
          status: "FAILED",
          error: `HeyGen API Error (HTTP ${response.status}): ${errorText}`,
        };
      }

      const resJson = await response.json() as { data?: { video_id: string } };
      const videoId = resJson.data?.video_id;

      if (!videoId) {
        return {
          id: "",
          status: "FAILED",
          error: "HeyGen no devolvió un video_id en su respuesta.",
        };
      }

      return {
        id: videoId,
        status: "PROCESSING",
      };
    } catch (err: any) {
      console.error("[HeyGen Service] Excepción en createVideo:", err);
      return {
        id: "",
        status: "FAILED",
        error: err.message || String(err),
      };
    }
  }

  /**
   * Consulta el estado de generación del video en HeyGen
   */
  static async getVideoStatus(videoId: string): Promise<HeyGenVideoResponse> {
    const apiKey = process.env.HEYGEN_API_KEY?.trim();
    const isMock = !apiKey || apiKey === "mock" || videoId.startsWith("mock_");

    if (isMock) {
      // Simular que el renderizado tarda 8 segundos
      const ageMs = Date.now() - parseInt(videoId.replace("mock_heygen_", "") || "0");
      if (ageMs > 8000) {
        return {
          id: videoId,
          status: "COMPLETED",
          videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4", // Test video
        };
      }
      return {
        id: videoId,
        status: "PROCESSING",
      };
    }

    try {
      const response = await fetch(`https://api.heygen.com/v3/videos/${videoId}`, {
        method: "GET",
        headers: this.getHeaders(apiKey!),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[HeyGen API Error] HTTP ${response.status} en GET status:`, errorText);
        return {
          id: videoId,
          status: "FAILED",
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const resJson = await response.json() as {
        data?: {
          id: string;
          status: "pending" | "processing" | "completed" | "failed";
          video_url?: string;
          failure_message?: string;
        };
      };

      const data = resJson.data;
      if (!data) {
        return {
          id: videoId,
          status: "FAILED",
          error: "HeyGen devolvió una respuesta vacía.",
        };
      }

      let status: HeyGenVideoResponse["status"] = "PROCESSING";
      if (data.status === "completed" && data.video_url) {
        status = "COMPLETED";
      } else if (data.status === "failed") {
        status = "FAILED";
      }

      return {
        id: videoId,
        status,
        videoUrl: data.video_url,
        error: data.failure_message,
      };
    } catch (err: any) {
      console.error("[HeyGen Service] Excepción en getVideoStatus:", err);
      return {
        id: videoId,
        status: "FAILED",
        error: err.message || String(err),
      };
    }
  }
}
