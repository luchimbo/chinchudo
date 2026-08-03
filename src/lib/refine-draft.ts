import { fetchChatCompletion, resolveLLMConfig } from "./llm-provider";
import { logger } from "./logger";

export type ChatMessage = {
  sender: "user" | "assistant";
  text: string;
  timestamp?: string;
};

export async function chatRefinementStep(params: {
  opportunityText: string;
  currentResponseText: string;
  chatHistory: ChatMessage[];
  userMessage: string;
  brandName: string;
  personaName: string;
  clientName?: string;
  clientMemories?: { rule: string }[];
}): Promise<string> {
  const llmConfig = resolveLLMConfig();
  const memoriesList = (params.clientMemories ?? []).map((m) => `- ${m.rule}`).join("\n");

  const systemMessage = `Sos un asistente experto en copy social para la marca "${params.brandName}" (Cliente: "${params.clientName ?? "General"}").
Estás ayudando al operador humano a pulir y perfeccionar una respuesta a un comentario en redes sociales.

Contexto del post/comentario original:
"${params.opportunityText.slice(0, 500)}"

Voz/Perfil utilizado: ${params.personaName}
Borrador de respuesta actual:
"${params.currentResponseText}"

${memoriesList ? `Reglas/Preferencias aprendidas de la marca:\n${memoriesList}\n` : ""}

Tu rol en este chat es dialogar de forma clara, directa y concisa con el operador. Podés opinar, proponer cambios o redactar una opción alternativa si el usuario te lo pide. Mantené un tono profesional, colaborador y muy claro.`;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemMessage },
  ];

  for (const msg of params.chatHistory) {
    messages.push({
      role: msg.sender === "user" ? "user" : "assistant",
      content: msg.text,
    });
  }

  messages.push({ role: "user", content: params.userMessage });

  try {
    const { response: res } = await fetchChatCompletion(llmConfig, {
        messages,
        temperature: 0.7,
        max_tokens: 1000,
    }, "10 Apostoles - Draft Chat Refinement");

    if (!res.ok) {
      const errBody = await res.text();
      logger.error("chat_refinement_http_error", `HTTP ${res.status}: ${errBody.slice(0, 200)}`).catch(() => { });
      return "Hubo un error al conectar con la IA. Por favor reintentá en un instante.";
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const answer = data.choices?.[0]?.message?.content?.trim();

    return answer || "No pude procesar la sugerencia. ¿Podrías reformularla?";
  } catch (err) {
    logger.error("chat_refinement_exception", "Error en chatRefinementStep", err).catch(() => { });
    return "Ocurrió un inconveniente de comunicación con el servicio de IA.";
  }
}

export async function compileResponseFromChat(params: {
  opportunityText: string;
  chatHistory: ChatMessage[];
  currentResponseText: string;
  brandName: string;
  personaName: string;
  clientMemories?: { rule: string }[];
}): Promise<string> {
  const llmConfig = resolveLLMConfig();
  const memoriesList = (params.clientMemories ?? []).map((m) => `- ${m.rule}`).join("\n");
  const formattedChat = params.chatHistory
    .map((msg) => `${msg.sender === "user" ? "Operador" : "IA"}: ${msg.text}`)
    .join("\n");

  const prompt = `Actuás como ${params.personaName} respondiendo a un comentario de redes para la marca ${params.brandName}.

Comentario original: "${params.opportunityText.slice(0, 500)}"
Borrador inicial: "${params.currentResponseText}"

Conversación e indicaciones dadas por el Operador:
${formattedChat}

${memoriesList ? `Reglas/Preferencias aprendidas de la marca:\n${memoriesList}\n` : ""}

REGLAS ABSOLUTAS:
- Generá exclusivamente el TEXTO FINAL de la respuesta perfeccionada.
- NO incluyas explicaciones, ni comillas extra, ni saludos al operador.
- No incluyas preguntas (solo afirmaciones, recomendaciones o datos útiles).
- Mantené el tono del perfil ${params.personaName} incorporando fielmente lo que pidió el operador en el chat.

Respuesta final (únicamente el texto a publicar):`;

  try {
    const { response: res } = await fetchChatCompletion(llmConfig, {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 800,
    }, "10 Apostoles - Compile Draft Response");

    if (!res.ok) {
      return params.currentResponseText;
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const compiled = data.choices?.[0]?.message?.content?.trim();

    return compiled || params.currentResponseText;
  } catch (err) {
    logger.error("compile_response_error", "Error en compileResponseFromChat", err).catch(() => { });
    return params.currentResponseText;
  }
}
