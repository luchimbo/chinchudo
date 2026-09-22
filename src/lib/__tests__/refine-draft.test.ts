import { describe, expect, it } from "vitest";
import { expandChatForModel, splitSuggestion, type ChatMessage } from "../refine-draft";

describe("propuestas del chat de ajuste", () => {
  it("separa la propuesta etiquetada del resto del mensaje", () => {
    expect(splitSuggestion("Te la dejo más corta:\n<propuesta>\"La MiniLab 3 va perfecta para arrancar.\"</propuesta>")).toEqual({
      message: "Te la dejo más corta:",
      suggestion: "La MiniLab 3 va perfecta para arrancar.",
    });
  });

  it("deja el mensaje tal cual cuando la IA solo opina", () => {
    expect(splitSuggestion("Me parece bien el tono, no la cambiaría.")).toEqual({ message: "Me parece bien el tono, no la cambiaría.", suggestion: null });
  });

  it("tolera la etiqueta sin cerrar y un mensaje que es solo la propuesta", () => {
    expect(splitSuggestion("<propuesta>Versión cortada por el límite")).toEqual({ message: "", suggestion: "Versión cortada por el límite" });
    expect(splitSuggestion("Listo <propuesta>  </propuesta>")).toEqual({ message: "Listo", suggestion: null });
  });

  it("le muestra a la IA la propuesta original y la edición del CM como turno del operador", () => {
    const history: ChatMessage[] = [
      { sender: "user", text: "Más corta" },
      { sender: "assistant", text: "Ahí va:", suggestion: { original: "Versión de la IA", text: "Versión editada por el CM" } },
      { sender: "assistant", text: "Otra opción", suggestion: { original: "Sin tocar", text: "Sin tocar" } },
    ];
    expect(expandChatForModel(history)).toEqual([
      { sender: "user", text: "Más corta" },
      { sender: "assistant", text: "Ahí va:\n\n<propuesta>Versión de la IA</propuesta>" },
      { sender: "user", text: "Edité tu propuesta directamente, quedó así: \"Versión editada por el CM\"" },
      { sender: "assistant", text: "Otra opción\n\n<propuesta>Sin tocar</propuesta>" },
    ]);
  });
});
