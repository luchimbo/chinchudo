"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OnboardingDraft } from "@/lib/onboarding";

type Step = {
  title: string;
  eyebrow: string;
  description: string;
};

const STEPS: Step[] = [
  { eyebrow: "01 · Contexto", title: "Conozcamos tu negocio", description: "Una URL alcanza para empezar. Después revisás cada propuesta." },
  { eyebrow: "02 · Revisión", title: "Lo que entendimos", description: "Confirmá identidad, temas, tono y límites de comunicación." },
  { eyebrow: "03 · Oferta", title: "Qué ayudás a resolver", description: "Cargá la oferta principal, sea producto, servicio o ambos." },
  { eyebrow: "04 · Conocimiento", title: "Respuestas con fundamento", description: "Las respuestas se apoyarán solo en información que apruebes." },
  { eyebrow: "05 · Escucha", title: "Dónde empezar a mirar", description: "Cafishia propone búsquedas públicas para detectar oportunidades." },
  { eyebrow: "06 · Listo", title: "Tu espacio está preparado", description: "Revisá lo esencial antes de abrir la suite." },
];

const STARTING_KNOWLEDGE = [
  "Qué problema resuelve nuestra oferta principal.",
  "Qué podemos prometer con seguridad y qué nunca debemos inventar.",
  "La pregunta que más se repite antes de contratar o comprar.",
];

const NETWORK_OPTIONS = ["YouTube", "Reddit", "Instagram", "TikTok", "Facebook", "X", "LinkedIn", "Google"] as const;
type Network = typeof NETWORK_OPTIONS[number];

const TOPIC_OPTIONS = [
  ["compra informada", "Compra informada", "Ayudar a decidir con criterio"],
  ["asesoramiento personalizado", "Asesoramiento", "Orientación según cada caso"],
  ["soluciones prácticas", "Uso práctico", "Problemas del día a día"],
  ["precio y conveniencia", "Precio y conveniencia", "Valor, planes y presupuesto"],
  ["comparativas", "Comparativas", "Diferencias entre alternativas"],
  ["soporte y confianza", "Soporte y confianza", "Garantía, respaldo y posventa"],
  ["educación", "Educación", "Guías para empezar o aprender"],
  ["novedades", "Novedades", "Lanzamientos y tendencias"],
] as const;

const TONE_OPTIONS = [
  ["Claro y cercano", "Habla simple, humano y sin vueltas."],
  ["Técnico simple", "Preciso, pero explica cada concepto."],
  ["Cálido y empático", "Primero entiende la situación de la persona."],
  ["Directo y comercial", "Va a la solución y facilita el próximo paso."],
  ["Moderno y aspiracional", "Transmite novedad sin exagerar promesas."],
  ["Institucional y sereno", "Prioriza respaldo, orden y confianza."],
] as const;

const CLAIM_OPTIONS = [
  "Asesoramiento personalizado",
  "Atención cercana",
  "Información clara",
  "Acompañamiento posventa",
  "Soluciones para distintos presupuestos",
] as const;

const LIMIT_OPTIONS = [
  "No inventar precios o stock",
  "No prometer resultados garantizados",
  "No afirmar especificaciones sin fuente",
  "No atacar a competidores",
  "No presionar para cerrar una venta",
] as const;

const KNOWLEDGE_SUGGESTIONS = [
  "Problema que resolvemos",
  "Pregunta frecuente",
  "Garantía o alcance",
  "Cómo elegir una opción",
  "Objeción habitual",
  "Próximo paso recomendado",
] as const;

function StepDot({ active, complete, index }: { active: boolean; complete: boolean; index: number }) {
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition ${
      complete ? "border-moss bg-moss text-paper" : active ? "border-ink bg-paper text-ink shadow-sm" : "border-ink/15 text-slate/45"
    }`}>
      {complete ? "✓" : String(index + 1).padStart(2, "0")}
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-bold uppercase tracking-[0.13em] text-slate/70">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-relaxed text-slate/55">{hint}</span> : null}
    </label>
  );
}

function ChoiceButton({ selected, title, description, onClick }: { selected: boolean; title: string; description?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`group flex min-h-[74px] items-start gap-3 rounded-xl border p-3.5 text-left transition ${selected ? "border-moss/50 bg-moss/[0.09] shadow-sm" : "border-ink/10 bg-white hover:border-ink/30"}`}
    >
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-bold ${selected ? "border-moss bg-moss text-paper" : "border-ink/20 text-transparent group-hover:text-ink/25"}`}>✓</span>
      <span><span className="block text-sm font-bold text-ink">{title}</span>{description ? <span className="mt-1 block text-xs leading-snug text-slate/55">{description}</span> : null}</span>
    </button>
  );
}

const inputClass = "w-full rounded-xl border border-ink/15 bg-white/70 px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-slate/35 focus:border-ink/50 focus:bg-white";

type Initial = { draft: Required<OnboardingDraft>; step: number; sourceUrl: string; businessType: string; status: string; analysisError: string };

export function OnboardingWizard({ initial, preview = false }: { initial?: Initial; preview?: boolean }) {
  const router = useRouter(); const draft = initial?.draft;
  const [step, setStep] = useState(initial?.step ?? 0);
  const [url, setUrl] = useState(initial?.sourceUrl || "https://www.tunegocio.com.ar");
  const [businessType, setBusinessType] = useState<"products" | "services" | "mixed">(initial?.businessType === "products" || initial?.businessType === "services" ? initial.businessType : "mixed");
  const [analysed, setAnalysed] = useState(Boolean(initial && initial.status !== "NOT_STARTED"));
  const [name, setName] = useState(draft?.name || "Casa Norte");
  const [description, setDescription] = useState(draft?.description || "Una marca cercana que ayuda a elegir soluciones simples para el día a día.");
  const [topics, setTopics] = useState<string[]>(draft?.topics?.length ? draft.topics : ["asesoramiento personalizado", "soluciones prácticas", "compra informada"]);
  const [customTopic, setCustomTopic] = useState("");
  const [brand, setBrand] = useState(draft?.brand || "Casa Norte");
  const [tone, setTone] = useState(draft?.tone || "Claro y cercano");
  const [claims, setClaims] = useState<string[]>(draft?.claims?.length ? draft.claims : ["Asesoramiento personalizado", "Atención cercana", "Información clara"]);
  const [limits, setLimits] = useState<string[]>(draft?.limits?.length ? draft.limits : ["No inventar precios o stock", "No prometer resultados garantizados", "No afirmar especificaciones sin fuente"]);
  const [offer, setOffer] = useState(draft?.offer || "Asesoramiento y selección de productos para cada necesidad");
  const [knowledgePrompts, setKnowledgePrompts] = useState<string[]>(draft?.knowledgePrompts?.length ? draft.knowledgePrompts : STARTING_KNOWLEDGE);
  const [knowledge, setKnowledge] = useState<string[]>(draft?.knowledge ?? ["", "", ""]);
  const [knowledgeTarget, setKnowledgeTarget] = useState(0);
  const [knowledgeApproved, setKnowledgeApproved] = useState(draft?.knowledgeApproved ?? false);
  const [selectedNetworks, setSelectedNetworks] = useState<Network[]>((draft?.selectedNetworks ?? []).filter((n): n is Network => NETWORK_OPTIONS.includes(n as Network)));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(preview ? "saved" : "saving");
  const [notice, setNotice] = useState(initial?.analysisError || "");
  const firstSave = useRef(true);
  const checklist = useMemo(() => [
    { label: "Identidad y tipo de negocio", done: Boolean(name.trim() && description.trim() && businessType) },
    { label: "Tres temas relevantes", done: topics.length >= 3 },
    { label: "Marca y oferta principal", done: Boolean(brand.trim() && offer.trim()) },
    { label: "Tono y límites seguros", done: Boolean(tone.trim() && limits.length) },
    { label: "Tres conocimientos aprobados", done: knowledgeApproved && knowledge.filter((item) => item.trim()).length >= 3 },
    { label: "Cinco voces estándar creadas", done: true },
    { label: "Redes para consultar elegidas", done: selectedNetworks.length > 0 },
  ], [brand, businessType, description, knowledge, knowledgeApproved, limits.length, name, offer, selectedNetworks, tone, topics]);

  const ready = checklist.every((item) => item.done);
  const stepValid = [
    /^https?:\/\//i.test(url.trim()) && Boolean(businessType),
    Boolean(name.trim() && description.trim() && brand.trim() && topics.length >= 3 && tone.trim()),
    Boolean(offer.trim() && claims.length > 0 && limits.length > 0),
    knowledgeApproved && knowledge.every((item) => item.trim().length > 0),
    selectedNetworks.length > 0,
    ready,
  ];
  const firstBlockedStep = stepValid.findIndex((valid) => !valid);
  const furthestAllowedStep = analysed ? (firstBlockedStep === -1 ? STEPS.length - 1 : firstBlockedStep) : 0;
  const buildKnowledgeText = (kind: string) => {
    const company = brand.trim() || name.trim() || "La marca";
    const mainOffer = offer.trim() || "su oferta principal";
    const primaryTopic = topics[0] || "la necesidad de cada persona";
    const secondaryTopic = topics[1] || "una compra informada";
    const safeClaim = claims[0] || "información clara";
    const safetyLimit = limits[0] || "no afirmar datos no confirmados";
    const generated: Record<string, string> = {
      "Problema que resolvemos": `${company} ayuda a quienes buscan ${primaryTopic} mediante ${mainOffer}. La prioridad es entender la necesidad concreta y orientar una solución práctica, sin empujar una venta innecesaria.`,
      "Pregunta frecuente": `Una consulta frecuente es cómo saber si ${mainOffer} resulta adecuado para cada caso. ${company} debe preguntar primero por el objetivo, el contexto de uso y el presupuesto antes de recomendar una alternativa.`,
      "Garantía o alcance": `${company} puede destacar ${safeClaim.toLowerCase()}, pero debe ${safetyLimit.toLowerCase()}. Cualquier condición de garantía, disponibilidad o alcance se confirma antes de comunicarla como definitiva.`,
      "Cómo elegir una opción": `Para elegir una opción conviene evaluar primero ${primaryTopic}, luego ${secondaryTopic} y finalmente comparar qué alternativa resuelve mejor el uso real. ${company} acompaña esa decisión con ${mainOffer}.`,
      "Objeción habitual": `Si una persona duda por precio o por no saber qué opción elegir, ${company} debe explicar las diferencias relevantes y el valor práctico de ${mainOffer}, evitando promesas absolutas o presión comercial.`,
      "Próximo paso recomendado": `Después de resolver la duda inicial, el próximo paso es pedir un dato concreto sobre el uso esperado y ofrecer una recomendación de ${company} basada en ${primaryTopic}.`,
    };
    return generated[kind] ?? `${company} debe responder sobre ${kind.toLowerCase()} usando la información confirmada de ${mainOffer}.`;
  };
  const prepareKnowledge = () => {
    const kinds = ["Problema que resolvemos", "Cómo elegir una opción", "Pregunta frecuente"];
    setKnowledgePrompts(kinds);
    setKnowledge(kinds.map(buildKnowledgeText));
    setKnowledgeApproved(false);
    setKnowledgeTarget(0);
  };
  const goNext = () => {
    if (!stepValid[step]) return;
    if (step === 2 && knowledge.every((item) => !item.trim())) prepareKnowledge();
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };
  const goBack = () => setStep((current) => Math.max(current - 1, 0));
  const toggle = (value: string, values: string[], setValues: (next: string[]) => void) => setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  const addCustomTopic = () => {
    const value = customTopic.trim();
    if (!value || topics.includes(value)) return;
    setTopics([...topics, value]);
    setCustomTopic("");
  };
  const applyKnowledgeSuggestion = (suggestion: string) => {
    setKnowledgePrompts((current) => current.map((item, position) => position === knowledgeTarget ? suggestion : item));
    setKnowledge((current) => current.map((item, position) => position === knowledgeTarget ? buildKnowledgeText(suggestion) : item));
    setKnowledgeApproved(false);
    setKnowledgeTarget((current) => (current + 1) % 3);
  };
  const toggleNetwork = (network: Network) => setSelectedNetworks((current) => current.includes(network) ? current.filter((item) => item !== network) : [...current, network]);
  const currentDraft = useMemo(() => ({ name, description, brand, tone, offer, topics, claims, limits, knowledge, knowledgePrompts, knowledgeApproved, selectedNetworks, unsureConfirmed: true }), [name, description, brand, tone, offer, topics, claims, limits, knowledge, knowledgePrompts, knowledgeApproved, selectedNetworks]);
  useEffect(() => {
    if (preview) return;
    if (firstSave.current) { firstSave.current = false; setSaveState("saved"); return; }
    const controller = new AbortController(); setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try { const response = await fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: currentDraft, sourceUrl: url, businessType, currentStep: step + 1 }), signal: controller.signal }); if (!response.ok) throw new Error(); setSaveState("saved"); }
      catch { if (!controller.signal.aborted) setSaveState("error"); }
    }, 600);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [businessType, currentDraft, preview, step, url]);
  const analyze = async () => {
    if (preview) { setAnalysed(true); goNext(); return; }
    setSaveState("saving"); setNotice("");
    try { const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "analyze", url }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); if (data.warning) setNotice(data.warning); setAnalysed(true); setSaveState("saved"); goNext(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo analizar el sitio."); setAnalysed(true); setSaveState("error"); }
  };
  const complete = async () => { if (preview) return window.alert("Vista local: la configuración se guardará al activar el onboarding real."); setSaveState("saving"); try { const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete" }) }); if (!response.ok) throw new Error(); router.push("/"); router.refresh(); } catch { setSaveState("error"); setNotice("No se pudo finalizar. Intentá de nuevo."); } };

  return (
    <main className="min-h-screen bg-[#f5f1e8] px-4 py-5 sm:px-8 sm:py-9">
      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-ink/10 bg-paper shadow-[0_30px_100px_rgba(37,31,19,0.12)] lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="relative overflow-hidden border-b border-ink/10 bg-[#17231e] px-6 py-7 text-[#eff3e8] lg:border-b-0 lg:border-r lg:px-7 lg:py-9">
          <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[#b9872f]/35 blur-3xl" />
          <div className="relative">
            <div className="mb-12 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d8b465] font-display text-xl text-[#17231e]">C</span>
              <div>
                <p className="font-display text-xl tracking-tight">Cafishia</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#eff3e8]/55">Configuración inicial</p>
              </div>
            </div>

            <div className="mb-7 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs leading-relaxed text-[#eff3e8]/70">
              {preview ? "Vista local: este recorrido no guarda información." : saveState === "saving" ? "Guardando cambios…" : saveState === "error" ? "No se pudo guardar. Cambiá un campo para reintentar." : "Cambios guardados automáticamente."}
            </div>

            <ol className="grid gap-1">
              {STEPS.map((item, index) => (
                <li key={item.title}>
                  <button
                    type="button"
                    onClick={() => {
                      if (index > furthestAllowedStep) return;
                      if (index === 3 && knowledge.every((item) => !item.trim())) prepareKnowledge();
                      setStep(index);
                    }}
                    disabled={index > furthestAllowedStep}
                    title={index > furthestAllowedStep ? "Completá los pasos anteriores para continuar" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition ${index === step ? "bg-white/10" : index > furthestAllowedStep ? "cursor-not-allowed opacity-35" : "hover:bg-white/[0.05]"}`}
                  >
                    <StepDot index={index} active={index === step} complete={index < step || (index === step && index === STEPS.length - 1 && ready)} />
                    <span className={`text-sm font-semibold ${index === step ? "text-white" : "text-[#eff3e8]/65"}`}>{item.title}</span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="mt-12 border-t border-white/10 pt-5 text-xs leading-relaxed text-[#eff3e8]/60">
              ¿Necesitás ayuda? Podés continuar con lo que sabés y revisar esta configuración más adelante.
            </div>
          </div>
        </aside>

        <section className="min-w-0 bg-[#fbfaf6] px-5 py-7 sm:px-10 sm:py-10 lg:px-14">
          <header className="mb-8 flex items-start justify-between gap-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brass">{STEPS[step].eyebrow}</p>
              <h1 className="mt-2 font-display text-4xl leading-[0.95] tracking-tight text-ink sm:text-5xl">{STEPS[step].title}</h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate/75">{STEPS[step].description}</p>
            </div>
            <span className="hidden rounded-full border border-ink/10 bg-paper px-3 py-1 text-xs font-bold text-slate/60 sm:inline">{step + 1} / {STEPS.length}</span>
          </header>
          {notice ? <div role="status" className="mb-5 rounded-xl border border-brass/30 bg-brass/[0.07] px-4 py-3 text-sm text-ink">{notice}</div> : null}

          {step === 0 ? (
            <div className="grid max-w-2xl gap-6">
              <div className="rounded-2xl border border-brass/25 bg-brass/[0.07] p-5">
                <p className="font-display text-xl text-ink">Empezamos con una sola página.</p>
                <p className="mt-1 text-sm leading-relaxed text-slate/70">Cafishia prepara una propuesta para revisar. No publica ni usa información sin tu confirmación.</p>
              </div>
              <Field label="Sitio web" hint="Puede ser la página principal de tu negocio.">
                <input value={url} onChange={(event) => setUrl(event.target.value)} className={inputClass} placeholder="https://www.tunegocio.com" />
              </Field>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-slate/70">Tu negocio combina</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    ["products", "Productos", "Vendemos cosas"],
                    ["services", "Servicios", "Vendemos tiempo"],
                    ["mixed", "Ambos", "Una combinación"],
                  ].map(([value, label, help]) => (
                    <button key={value} type="button" onClick={() => setBusinessType(value as typeof businessType)} className={`rounded-xl border p-4 text-left transition ${businessType === value ? "border-ink bg-ink text-paper shadow-lg" : "border-ink/12 bg-white hover:border-ink/30"}`}>
                      <span className="block text-sm font-bold">{label}</span><span className={`mt-1 block text-xs ${businessType === value ? "text-paper/65" : "text-slate/55"}`}>{help}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" disabled={!stepValid[0] || saveState === "saving"} onClick={analyze} className="mt-2 w-fit rounded-full bg-ink px-6 py-3 text-sm font-bold text-paper shadow-lg shadow-ink/15 transition hover:-translate-y-0.5 hover:bg-slate disabled:cursor-not-allowed disabled:opacity-40">
                {analysed ? "Revisar propuesta" : "Analizar y preparar propuesta"}
              </button>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid max-w-3xl gap-6">
              {analysed ? <div className="rounded-xl border border-moss/25 bg-moss/[0.08] px-4 py-3 text-sm text-moss">Propuesta de ejemplo lista para revisar. En producción se generará a partir de {url || "tu URL"}.</div> : null}
              <div className="grid gap-5 sm:grid-cols-2"><Field label="Nombre visible"><input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></Field><Field label="Marca principal"><input value={brand} onChange={(event) => setBrand(event.target.value)} className={inputClass} /></Field></div>
              <Field label="Descripción"><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className={`${inputClass} resize-y`} /></Field>
              <div>
                <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.13em] text-slate/70">¿De qué temas querés hablar?</p><p className="mt-1 text-xs text-slate/55">Elegí al menos tres. Podés combinarlos libremente.</p></div><span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-bold text-slate/60">{topics.length} elegidos</span></div>
                <div className="grid gap-2 sm:grid-cols-2">{TOPIC_OPTIONS.map(([value, title, help]) => <ChoiceButton key={value} selected={topics.includes(value)} title={title} description={help} onClick={() => toggle(value, topics, setTopics)} />)}</div>
                <div className="mt-3 flex gap-2"><input value={customTopic} onChange={(event) => setCustomTopic(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomTopic(); } }} className={inputClass} placeholder="Otro tema específico…" /><button type="button" onClick={addCustomTopic} className="shrink-0 rounded-xl border border-ink/15 bg-white px-4 text-sm font-bold text-ink hover:border-ink/40">Agregar</button></div>
                {topics.filter((topic) => !TOPIC_OPTIONS.some(([value]) => value === topic)).length ? <div className="mt-2 flex flex-wrap gap-2">{topics.filter((topic) => !TOPIC_OPTIONS.some(([value]) => value === topic)).map((topic) => <button type="button" key={topic} onClick={() => toggle(topic, topics, setTopics)} className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-paper">{topic} ×</button>)}</div> : null}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate/70">¿Cómo querés que suene?</p><p className="mb-3 mt-1 text-xs text-slate/55">Elegí un tono principal. Las voces lo adaptarán según cada conversación.</p>
                <div className="grid gap-2 sm:grid-cols-2">{TONE_OPTIONS.map(([title, help]) => <ChoiceButton key={title} selected={tone === title} title={title} description={help} onClick={() => setTone(title)} />)}</div>
              </div>
              <div className="rounded-2xl border border-ink/10 bg-paper p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate/55">Voces de Cafishia</p><p className="mt-2 text-sm leading-relaxed text-slate/75">Las cinco voces estándar se crean automáticamente. Más adelante podrás editar sus textos desde Configuración, pero no hace falta elegirlas ahora.</p><div className="mt-3 flex flex-wrap gap-2">{["Técnico", "Práctico", "Innovación", "Educativo", "Comercial"].map((voice) => <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink shadow-sm" key={voice}>{voice}</span>)}</div></div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid max-w-3xl gap-6"><div className="rounded-2xl border border-ink/10 bg-paper p-5"><p className="font-display text-2xl text-ink">La primera oferta es suficiente.</p><p className="mt-1 text-sm text-slate/70">Después podrás sumar productos o servicios desde el catálogo.</p></div><Field label={businessType === "services" ? "Servicio principal" : businessType === "products" ? "Producto principal" : "Oferta principal"}><input value={offer} onChange={(event) => setOffer(event.target.value)} className={inputClass} /></Field><div><p className="text-xs font-bold uppercase tracking-[0.13em] text-slate/70">¿Qué podemos destacar?</p><p className="mb-3 mt-1 text-xs text-slate/55">Elegí solo afirmaciones reales para tu negocio.</p><div className="grid gap-2 sm:grid-cols-2">{CLAIM_OPTIONS.map((claim) => <ChoiceButton key={claim} selected={claims.includes(claim)} title={claim} onClick={() => toggle(claim, claims, setClaims)} />)}</div></div><div><p className="text-xs font-bold uppercase tracking-[0.13em] text-slate/70">Límites de seguridad</p><p className="mb-3 mt-1 text-xs text-slate/55">Cafishia aplicará estos límites a todas las respuestas.</p><div className="grid gap-2 sm:grid-cols-2">{LIMIT_OPTIONS.map((limit) => <ChoiceButton key={limit} selected={limits.includes(limit)} title={limit} onClick={() => toggle(limit, limits, setLimits)} />)}</div></div></div>
          ) : null}

          {step === 3 ? (
            <div className="grid max-w-3xl gap-5">
              <div className="rounded-2xl border border-brass/25 bg-brass/[0.06] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-brass">Generado por Cafishia</p>
                <p className="mt-2 font-display text-2xl text-ink">Preparamos tres respuestas para {brand || name}.</p>
                <p className="mt-1 text-sm leading-relaxed text-slate/70">Usamos la marca, la oferta, los temas, el tono y los límites que elegiste antes. Revisalas y corregí cualquier dato que no represente al negocio.</p>
              </div>
              <div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-[0.13em] text-slate/70">Cambiar el enfoque</p><p className="mt-1 text-xs text-slate/55">La opción que elijas reemplazará la propuesta {knowledgeTarget + 1} con contenido nuevo.</p></div>
                  <button type="button" onClick={prepareKnowledge} className="rounded-full border border-ink/15 bg-white px-3 py-2 text-xs font-bold text-ink transition hover:border-brass hover:bg-brass/[0.06]">↻ Regenerar las tres</button>
                </div>
                <div className="flex flex-wrap gap-2">{KNOWLEDGE_SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion} onClick={() => applyKnowledgeSuggestion(suggestion)} className="rounded-full border border-ink/15 bg-white px-3 py-2 text-xs font-bold text-ink transition hover:border-brass hover:bg-brass/[0.06]">+ {suggestion}</button>)}</div>
              </div>
              {knowledge.map((item, index) => (
                <div key={index} className={`rounded-2xl border bg-white p-4 transition ${knowledgeTarget === index ? "border-brass shadow-[0_0_0_3px_rgba(185,135,47,0.08)]" : "border-ink/10"}`}>
                  <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brass">Propuesta automática {index + 1}</p><p className="mt-1 text-sm font-bold text-ink">{knowledgePrompts[index]}</p></div>{knowledgeTarget === index ? <span className="rounded-full bg-brass/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brass">Próxima a cambiar</span> : null}</div>
                  <textarea value={item} onChange={(event) => { setKnowledge((current) => current.map((value, position) => position === index ? event.target.value : value)); setKnowledgeApproved(false); }} rows={4} aria-label={`Propuesta automática ${index + 1}: ${knowledgePrompts[index]}`} className={`${inputClass} resize-y`} />
                </div>
              ))}
              <div className={`rounded-2xl border p-4 ${knowledgeApproved ? "border-moss/30 bg-moss/[0.06]" : "border-ink/10 bg-white"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-ink">{knowledgeApproved ? "Respuestas aprobadas" : "¿Estas respuestas representan a la marca?"}</p><p className="mt-1 text-xs text-slate/60">Si editás o regenerás una propuesta, tendrás que aprobarlas nuevamente.</p></div><button type="button" disabled={knowledge.some((item) => !item.trim())} onClick={() => setKnowledgeApproved(true)} className={`rounded-xl px-4 py-3 text-sm font-bold transition ${knowledgeApproved ? "bg-moss text-white" : "bg-ink text-paper hover:bg-moss disabled:cursor-not-allowed disabled:opacity-35"}`}>{knowledgeApproved ? "✓ Aprobadas" : "Aprobar las tres respuestas"}</button></div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid max-w-3xl gap-5">
              <div className="rounded-2xl border border-ink/10 bg-paper p-5"><p className="font-display text-2xl text-ink">¿En qué redes querés buscar oportunidades?</p><p className="mt-1 text-sm leading-relaxed text-slate/70">Elegí solamente los lugares donde querés que Cafishia consulte. Nosotros nos ocupamos de preparar las búsquedas con la información de la marca.</p></div>
              <div><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.13em] text-slate/70">Redes para consultar</p><p className="mt-1 text-xs text-slate/55">Podés elegir una o varias.</p></div><span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-bold text-slate/60">{selectedNetworks.length} {selectedNetworks.length === 1 ? "elegida" : "elegidas"}</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{NETWORK_OPTIONS.map((network) => <button type="button" aria-pressed={selectedNetworks.includes(network)} key={network} onClick={() => toggleNetwork(network)} className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${selectedNetworks.includes(network) ? "border-moss bg-moss text-paper shadow-sm" : "border-ink/10 bg-white text-ink hover:border-ink/35"}`}>{selectedNetworks.includes(network) ? "✓ " : "+ "}{network}</button>)}</div></div>
              {selectedNetworks.length > 0 ? <div className="rounded-2xl border border-moss/25 bg-moss/[0.06] px-5 py-4"><p className="text-sm font-bold text-ink">Cafishia consultará: {selectedNetworks.join(", ")}.</p><p className="mt-1 text-xs text-slate/60">Las búsquedas se configurarán automáticamente; no necesitás escribir nada más.</p></div> : <div className="rounded-2xl border border-dashed border-ink/20 bg-white/50 px-5 py-8 text-center text-sm text-slate/60">Elegí al menos una red para continuar.</div>}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="grid max-w-2xl gap-6"><div className={`rounded-2xl border p-6 ${ready ? "border-moss/30 bg-moss/[0.08]" : "border-signal/25 bg-signal/[0.06]"}`}><p className="font-display text-3xl text-ink">{ready ? "Todo lo esencial está listo." : "Todavía falta un poco."}</p><p className="mt-2 text-sm leading-relaxed text-slate/75">Al finalizar, Cafishia guardará esta configuración y abrirá tu espacio de trabajo.</p></div><ul className="grid gap-2">{checklist.map((item) => <li key={item.label} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm"><span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${item.done ? "bg-moss text-paper" : "bg-signal/15 text-signal"}`}>{item.done ? "✓" : "!"}</span><span className="font-medium text-ink">{item.label}</span></li>)}</ul>{ready ? <button type="button" onClick={() => window.alert("Vista local: en producción, esto guardará tu configuración y abrirá la suite.")} className="w-fit rounded-full bg-moss px-6 py-3 text-sm font-bold text-paper shadow-lg shadow-moss/20 transition hover:-translate-y-0.5">Finalizar configuración</button> : null}</div>
          ) : null}

          {step === 5 && ready && !preview ? <button type="button" onClick={complete} disabled={saveState === "saving"} className="mt-4 w-fit rounded-full bg-ink px-6 py-3 text-sm font-bold text-paper transition hover:bg-moss disabled:opacity-50">Abrir el panel</button> : null}

          <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-5"><button type="button" onClick={goBack} disabled={step === 0} className="rounded-full px-3 py-2 text-sm font-bold text-slate/60 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-30">← Volver</button>{step > 0 && step < STEPS.length - 1 ? <div className="ml-auto flex items-center gap-3">{!stepValid[step] ? <span className="max-w-52 text-right text-xs font-medium text-signal">Completá este paso para continuar.</span> : null}<button type="button" onClick={goNext} disabled={!stepValid[step]} className="rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-bold text-ink transition hover:border-ink hover:bg-paper disabled:cursor-not-allowed disabled:border-ink/10 disabled:bg-ink/[0.03] disabled:text-slate/35">Continuar →</button></div> : <span />}</footer>
        </section>
      </div>
    </main>
  );
}
