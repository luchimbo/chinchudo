const URGENT_RISK = /\b(?:suicid(?:io|arse|a)|autolesi[oó]n|sobredosis|overdose|violencia|arma|inconsciente|no respira)\b/i;

export function makeVidiaDrafts(text: string, channel: string) {
  const isUrgent = URGENT_RISK.test(text);
  const channelHint = /instagram|tiktok/i.test(channel)
    ? "Escribinos por el canal de contacto del perfil para que el equipo pueda orientarte."
    : "Podés contactar al equipo de Vidia para recibir una primera orientación."

  if (isUrgent) {
    return [
      {
        variantType: "SHORT" as const,
        draftText: "Lamentamos que estén atravesando una situación tan difícil. Si hay un riesgo inmediato, contacten ahora a emergencias locales o a un servicio de guardia.",
        riskNotes: "Posible situación urgente: no diagnosticar ni continuar el caso en público. Escalar al protocolo humano de crisis.",
      },
      {
        variantType: "TECHNICAL" as const,
        draftText: "Por lo que mencionás, es importante buscar atención inmediata a través de emergencias locales o una guardia profesional. No es seguro resolver esta situación por comentarios.",
        riskNotes: "Posible situación urgente: no diagnosticar ni continuar el caso en público. Escalar al protocolo humano de crisis.",
      },
      {
        variantType: "CONVERSATIONAL" as const,
        draftText: "Entendemos la angustia. En una situación de riesgo, lo más importante es pedir ayuda inmediata a emergencias locales o a un servicio profesional de guardia.",
        riskNotes: "Posible situación urgente: no diagnosticar ni continuar el caso en público. Escalar al protocolo humano de crisis.",
      },
    ];
  }

  return [
    {
      variantType: "SHORT" as const,
      draftText: `Lamentamos que estén atravesando un momento difícil. ${channelHint}`,
      riskNotes: "Revisión humana obligatoria. No diagnosticar, prometer resultados ni solicitar información clínica en público.",
    },
    {
      variantType: "TECHNICAL" as const,
      draftText: `Cada situación necesita una evaluación profesional y confidencial. ${channelHint}`,
      riskNotes: "Revisión humana obligatoria. No diagnosticar, prometer resultados ni solicitar información clínica en público.",
    },
    {
      variantType: "CONVERSATIONAL" as const,
      draftText: `Pedir orientación puede ser un primer paso importante. ${channelHint}`,
      riskNotes: "Revisión humana obligatoria. No diagnosticar, prometer resultados ni solicitar información clínica en público.",
    },
  ];
}
