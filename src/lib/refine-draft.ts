import { fetchChatCompletion, resolveLLMConfig } from "./llm-provider";
import { logger } from "./logger";

/** Versión de la respuesta que la IA propuso en el chat; `text` puede estar editado por el CM. */
export type ChatSuggestion = { text: string; original: string };

export type ChatMessage = {
  sender: "user" | "assistant";
  text: string;
  timestamp?: string;
  suggestion?: ChatSuggestion;
};

export type AcceptedExample = { comment: string; response: string };

const SUGGESTION_TAG = /<propuesta>([\s\S]*?)(?:<\/propuesta>|$)/i;

/** Separa la propuesta etiquetada del resto del mensaje de la IA. Tolera la etiqueta sin cerrar. */
export function splitSuggestion(raw: string): { message: string; suggestion: string | null } {
  const match = raw.match(SUGGESTION_TAG);
  if (!match) return { message: raw.trim(), suggestion: null };
  const suggestion = match[1].trim().replace(/^["“«]+|["”»]+$/g, "").trim();
  const message = raw.replace(match[0], "").replace(/<\/?propuesta>/gi, "").replace(/\n{3,}/g, "\n\n").trim();
  return { message, suggestion: suggestion || null };
}

/**
 * Historial tal como lo lee la IA: la propuesta vuelve a su etiqueta y, si el CM la
 * editó a mano, esa edición aparece como un turno del operador (sirve para seguir
 * ajustando y para aprender de la corrección).
 */
export function expandChatForModel(history: ChatMessage[]): { sender: "user" | "assistant"; text: string }[] {
  return history.flatMap((message) => {
    if (message.sender !== "assistant" || !message.suggestion) return [{ sender: message.sender, text: message.text }];
    const { text, original } = message.suggestion;
    const turns: { sender: "user" | "assistant"; text: string }[] = [
      { sender: "assistant", text: [message.text, `<propuesta>${original}</propuesta>`].filter(Boolean).join("\n\n") },
    ];
    if (text.trim() !== original.trim()) {
      turns.push({ sender: "user", text: `Edité tu propuesta directamente, quedó así: "${text}"` });
    }
    return turns;
  });
}

function formatAcceptedExamples(examples?: AcceptedExample[]): string {
  if (!examples?.length) return "";
  const lines = examples.map((example) => `- Comentario: "${example.comment.replace(/\s+/g, " ").slice(0, 300)}" → Respuesta correcta: "${example.response.slice(0, 300)}"`);
  return `Respuestas que el CM aprobó como correctas (referencia de criterio y tono, no las copies):\n${lines.join("\n")}\n`;
}

/** Recorta sin partir palabras, prefiriendo cerrar en una oración completa. */
function fitToMaxCharacters(text: string, maxCharacters?: number): string {
  const clean = text.trim().replace(/^["“]+|["”]+$/g, "").trim();
  if (!maxCharacters || clean.length <= maxCharacters) return clean;
  const cut = clean.slice(0, maxCharacters);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentenceEnd > maxCharacters * 0.6) return cut.slice(0, sentenceEnd + 1).trim();
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

export async function chatRefinementStep(params: {
  opportunityText: string;
  currentResponseText: string;
  chatHistory: ChatMessage[];
  userMessage: string;
  brandName: string;
  personaName: string;
  clientName?: string;
  clientMemories?: { rule: string }[];
  acceptedExamples?: AcceptedExample[];
  maxCharacters?: number;
}): Promise<{ message: string; suggestion: string | null }> {
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
${formatAcceptedExamples(params.acceptedExamples)}
Tu rol en este chat es dialogar de forma clara, directa y concisa con el operador. Podés opinar, proponer cambios o redactar una opción alternativa si el usuario te lo pide. Mantené un tono profesional, colaborador y muy claro.

Formato de las propuestas:
- Cada vez que el operador pida cambiar la respuesta (más corta, otro tono, otro dato, etc.) o te pida una versión, escribí la respuesta COMPLETA lista para publicar entre <propuesta> y </propuesta>, una sola vez por mensaje${params.maxCharacters ? `, con un máximo de ${params.maxCharacters} caracteres` : ""}.
- Fuera de la etiqueta, como mucho una línea breve que explique el cambio. No repitas la propuesta fuera de la etiqueta.
- Si el operador solo pregunta algo o pide tu opinión, respondé sin la etiqueta.
- Si el operador editó tu propuesta a mano, tomá su versión como la nueva base.`;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemMessage },
  ];

  for (const msg of expandChatForModel(params.chatHistory)) {
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
      return { message: "Hubo un error al conectar con la IA. Por favor reintentá en un instante.", suggestion: null };
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const answer = data.choices?.[0]?.message?.content?.trim();

    return answer ? splitSuggestion(answer) : { message: "No pude procesar la sugerencia. ¿Podrías reformularla?", suggestion: null };
  } catch (err) {
    logger.error("chat_refinement_exception", "Error en chatRefinementStep", err).catch(() => { });
    return { message: "Ocurrió un inconveniente de comunicación con el servicio de IA.", suggestion: null };
  }
}

export async function compileResponseFromChat(params: {
  opportunityText: string;
  chatHistory: ChatMessage[];
  currentResponseText: string;
  brandName: string;
  personaName: string;
  clientMemories?: { rule: string }[];
  acceptedExamples?: AcceptedExample[];
  maxCharacters?: number;
}): Promise<string> {
  const llmConfig = resolveLLMConfig();
  const memoriesList = (params.clientMemories ?? []).map((m) => `- ${m.rule}`).join("\n");
  const formattedChat = expandChatForModel(params.chatHistory)
    .map((msg) => `${msg.sender === "user" ? "Operador" : "IA"}: ${msg.text}`)
    .join("\n");

  const prompt = `Actuás como ${params.personaName} respondiendo a un comentario de redes para la marca ${params.brandName}.

Comentario original: "${params.opportunityText.slice(0, 500)}"
Borrador inicial: "${params.currentResponseText}"

Conversación e indicaciones dadas por el Operador:
${formattedChat}

${memoriesList ? `Reglas/Preferencias aprendidas de la marca:\n${memoriesList}\n` : ""}
${formatAcceptedExamples(params.acceptedExamples)}
REGLAS ABSOLUTAS:
- Generá exclusivamente el TEXTO FINAL de la respuesta perfeccionada.
- NO incluyas explicaciones, ni comillas extra, ni saludos al operador.
- No incluyas preguntas (solo afirmaciones, recomendaciones o datos útiles).
- Mantené el tono del perfil ${params.personaName} incorporando fielmente lo que pidió el operador en el chat.${params.maxCharacters ? `\n- Máximo ${params.maxCharacters} caracteres en total.` : ""}

Respuesta final (únicamente el texto a publicar):`;

  try {
    const { response: res } = await fetchChatCompletion(llmConfig, {
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 800,
    }, "10 Apostoles - Compile Draft Response");

    if (!res.ok) {
      return fitToMaxCharacters(params.currentResponseText, params.maxCharacters);
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const compiled = data.choices?.[0]?.message?.content?.trim();

    return fitToMaxCharacters(compiled || params.currentResponseText, params.maxCharacters);
  } catch (err) {
    logger.error("compile_response_error", "Error en compileResponseFromChat", err).catch(() => { });
    return fitToMaxCharacters(params.currentResponseText, params.maxCharacters);
  }
}
