type RenderVideoOptions = {
  avatarVideoUrl: string;
  imgHookUrl: string;
  imgBodyUrl: string;
  imgCtaUrl: string;
  musicTrack: string;
  hookText: string;
  bodyText: string;
  ctaText: string;
};

export class CreatomateService {
  static async renderVideo(options: RenderVideoOptions): Promise<string> {
    const apiKey = process.env.CREATOMATE_API_KEY?.trim();
    const templateId = process.env.CREATOMATE_TEMPLATE_ID?.trim();
    const isMock = !apiKey || apiKey === "mock" || !templateId;

    if (isMock) {
      console.log("[Creatomate Service] Ejecutando en Modo MOCK");
      // Devolvemos el mismo video del avatar como fallback en modo de desarrollo/mock
      return options.avatarVideoUrl;
    }

    try {
      console.log("[Creatomate Service] Iniciando render de video en la nube...");
      
      const response = await fetch("https://api.creatomate.com/v1/renders", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_id: templateId,
          modifications: {
            "spokesperson_video": options.avatarVideoUrl,
            "hook_image": options.imgHookUrl,
            "body_image": options.imgBodyUrl,
            "cta_image": options.imgCtaUrl,
            "music_track": options.musicTrack,
            "hook_text": options.hookText,
            "body_text": options.bodyText,
            "cta_text": options.ctaText,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("[Creatomate API Error]:", errText);
        throw new Error(`Creatomate API Error (HTTP ${response.status}): ${errText}`);
      }

      const data = await response.json();
      const renderJob = data[0];
      
      if (!renderJob || !renderJob.id) {
        throw new Error("Respuesta inválida de Creatomate: No se recibió ID de tarea");
      }

      const jobId = renderJob.id;
      console.log(`[Creatomate Service] Tarea de render creada con ID: ${jobId}. Iniciando polling...`);

      // Polling de 25 intentos con 3 segundos de espera (máximo 75 segundos)
      for (let attempt = 1; attempt <= 25; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const checkRes = await fetch(`https://api.creatomate.com/v1/renders/${jobId}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
          },
        });

        if (!checkRes.ok) {
          console.warn(`[Creatomate Polling] Intento ${attempt} fallido al consultar estado`);
          continue;
        }

        const checkData = await checkRes.json();
        const status = checkData.status;
        console.log(`[Creatomate Polling] Intento ${attempt} - Estado: ${status}`);

        if (status === "succeeded") {
          console.log("[Creatomate Service] ¡Video renderizado con éxito en la nube!");
          return checkData.url;
        } else if (status === "failed") {
          throw new Error(`Creatomate Render Falló: ${checkData.error_message || "Error desconocido"}`);
        }
      }

      throw new Error("Tiempo de espera agotado al renderizar video en Creatomate");
    } catch (err: any) {
      console.error("[Creatomate Service Error]:", err);
      throw err;
    }
  }
}
