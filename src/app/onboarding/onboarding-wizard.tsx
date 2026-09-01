"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import type {
  OnboardingDraft,
  OnboardingEvidence,
} from "@/lib/onboarding";

const NETWORKS = [
  "Instagram",
  "Facebook",
  "YouTube",
  "TikTok",
  "X",
  "LinkedIn",
  "Reddit",
  "Google",
];
const STEPS = [
  ["01", "Analizar", "Pegá la página de tu negocio."],
  ["02", "Revisar", "Corregí sólo lo que haga falta."],
  ["03", "Activar", "Confirmá y abrí tu espacio."],
] as const;
type Initial = {
  draft: Required<OnboardingDraft>;
  step: number;
  sourceUrl: string;
  businessType: string;
  status: string;
  analysisError: string;
};
type SaveState = "saved" | "saving" | "error";

function clientDraft(value?: OnboardingDraft): Required<OnboardingDraft> {
  const raw = value ?? {};
  return {
    name: raw.name || "",
    description: raw.description || "",
    brand: raw.brand || "",
    tone: raw.tone || "Claro y cercano",
    offer: raw.offer || "",
    targetAudience: raw.targetAudience || "",
    businessGoals: raw.businessGoals || [],
    topics: raw.topics || [],
    claims: raw.claims || [],
    limits: raw.limits || [],
    knowledge: [...(raw.knowledge || []), "", "", ""].slice(0, 3),
    knowledgePrompts: [
      ...(raw.knowledgePrompts || []),
      "Problema que resolvemos",
      "Cómo elegir una opción",
      "Pregunta frecuente",
    ].slice(0, 3),
    knowledgeApproved: raw.knowledgeApproved === true,
    selectedNetworks: raw.selectedNetworks || [],
    unsureConfirmed: raw.unsureConfirmed === true,
    detectedBusinessType: raw.detectedBusinessType || "mixed",
    detectedPlatform: raw.detectedPlatform || "Sitio web",
    offerings: raw.offerings || [],
    evidence: raw.evidence || {},
    manualFields: raw.manualFields || [],
    warnings: raw.warnings || [],
    stats: raw.stats || {
      pagesRead: 0,
      pagesDiscarded: 0,
      products: 0,
      services: 0,
      durationMs: 0,
    },
  };
}

const input =
  "w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-slate/35 focus:border-moss focus:ring-4 focus:ring-moss/10";
function Badge({ evidence }: { evidence?: OnboardingEvidence }) {
  const item = evidence || {
    status: "needs_confirmation",
    confidence: "low",
    url: "",
  };
  const labels = {
    extracted: "Extraído",
    suggested: "Sugerido",
    manual: "Manual",
    needs_confirmation: "Falta confirmar",
  } as const;
  const styles = {
    extracted: "bg-moss/10 text-moss",
    suggested: "bg-brass/15 text-brass",
    manual: "bg-ink/10 text-ink",
    needs_confirmation: "bg-signal/10 text-signal",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${styles[item.status]}`}
    >
      {labels[item.status]} ·{" "}
      {item.confidence === "high"
        ? "alta"
        : item.confidence === "medium"
          ? "media"
          : "baja"}
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="ml-1 underline"
        >
          Fuente ↗
        </a>
      ) : null}
    </span>
  );
}
function Field({
  label,
  evidence,
  children,
}: {
  label: string;
  evidence?: OnboardingEvidence;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-[0.13em] text-slate/70">
        {label}
        <Badge evidence={evidence} />
      </span>
      {children}
    </label>
  );
}
export function OnboardingWizard({
  initial,
  preview = false,
}: {
  initial?: Initial;
  preview?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(initial?.step ?? 0, 2));
  const [url, setUrl] = useState(initial?.sourceUrl || "");
  const [draft, setDraft] = useState<Required<OnboardingDraft>>(() =>
    clientDraft(initial?.draft),
  );
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notice, setNotice] = useState(initial?.analysisError || "");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStages, setAnalysisStages] = useState<string[]>([]);
  const [manualOfferingName, setManualOfferingName] = useState("");
  const [manualOfferingKind, setManualOfferingKind] = useState<
    "product" | "service"
  >("product");
  const firstSave = useRef(true);
  const markManual = (field: string) =>
    setDraft((current) => ({
      ...current,
      manualFields: [...new Set([...current.manualFields, field])],
      evidence: {
        ...current.evidence,
        [field]: {
          url: current.evidence[field]?.url || url,
          status: "manual",
          confidence: "high",
        },
      },
    }));
  const setField = <K extends keyof Required<OnboardingDraft>>(
    field: K,
    value: Required<OnboardingDraft>[K],
  ) => {
    setDraft((current) => ({ ...current, [field]: value }));
    markManual(String(field));
  };
  const addManualOffering = () => {
    const name = manualOfferingName.trim();
    if (!name) return;
    const id = `manual-${Date.now()}`;
    setDraft((current) => ({
      ...current,
      offerings: [
        ...current.offerings,
        {
          id,
          kind: manualOfferingKind,
          name,
          category: "",
          description: "",
          specs: "",
          scope: "",
          modality: "",
          audience: "",
          price: "Por confirmar",
          availability: "Por confirmar",
          url,
          selected: true,
          evidence: { url, status: "manual", confidence: "high" },
        },
      ],
      manualFields: [
        ...new Set([...current.manualFields, `offering:${id}`]),
      ],
    }));
    setManualOfferingName("");
  };
  useEffect(() => {
    if (preview || firstSave.current) {
      firstSave.current = false;
      return;
    }
    const controller = new AbortController();
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/onboarding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draft,
            sourceUrl: url,
            businessType: draft.detectedBusinessType,
            currentStep: step + 1,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        setSaveState("saved");
      } catch {
        if (!controller.signal.aborted) setSaveState("error");
      }
    }, 700);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [draft, preview, step, url]);
  const analyze = async () => {
    const normalizedUrl = normalizeWebsiteUrl(url);
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      setNotice("Ingresá una dirección web válida.");
      return;
    }
    setUrl(normalizedUrl);
    setIsAnalyzing(true);
    setNotice("");
    setAnalysisStages(["Leyendo el sitio…"]);
    const progress = window.setInterval(
      () =>
        setAnalysisStages((current) =>
          current.length === 1
            ? [...current, "Buscando secciones y ofertas…"]
            : current.length === 2
              ? [...current, "Preparando conocimiento y tono…"]
              : current,
        ),
      1000,
    );
    try {
      const endpoint = preview ? "/api/onboarding/preview" : "/api/onboarding";
      const body = preview
        ? { url: normalizedUrl }
        : { action: "analyze", url: normalizedUrl };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "No se pudo analizar el sitio.");
      const next = clientDraft(data.draft || data.onboarding?.draft);
      setDraft(next);
      setNotice(data.warning || "");
      setStep(1);
      setSaveState("saved");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo analizar el sitio.",
      );
      setSaveState("error");
    } finally {
      window.clearInterval(progress);
      setIsAnalyzing(false);
    }
  };
  const complete = async () => {
    if (preview) {
      window.alert(
        "Vista local: los datos no se guardan. Registrá un espacio para activar esta configuración.",
      );
      return;
    }
    setSaveState("saving");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      if (!response.ok) throw new Error();
      router.push("/");
      router.refresh();
    } catch {
      setSaveState("error");
      setNotice("No se pudo finalizar. Intentá de nuevo.");
    }
  };
  const productCount = draft.offerings.filter(
      (item) => item.kind === "product",
    ).length,
    serviceCount = draft.offerings.filter(
      (item) => item.kind === "service",
    ).length;
  const catalogCategories = [
    ...new Set(
      draft.offerings.map((item) => item.category.trim()).filter(Boolean),
    ),
  ].slice(0, 6);
  const canContinue =
    step === 0
      ? /^https?:\/\//i.test(normalizeWebsiteUrl(url))
      : step === 1
        ? Boolean(draft.name.trim() && draft.brand.trim())
        : true;
  const detected = useMemo(
    () => draft.stats.pagesRead > 0,
    [draft.stats.pagesRead],
  );
  return (
    <main className="min-h-screen bg-[#f5f1e8] px-4 py-5 sm:px-8 sm:py-9">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] border border-ink/10 bg-paper shadow-[0_30px_100px_rgba(37,31,19,0.12)] lg:grid-cols-[275px_minmax(0,1fr)]">
        <aside className="relative overflow-hidden bg-[#17231e] px-6 py-7 text-[#eff3e8] lg:px-7 lg:py-9">
          <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[#b9872f]/35 blur-3xl" />
          <div className="relative">
            <div className="mb-12 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d8b465] font-display text-xl text-[#17231e]">
                C
              </span>
              <div>
                <p className="font-display text-xl tracking-tight">Cafishia</p>
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#eff3e8]/55">
                  Configuración inicial
                </p>
              </div>
            </div>
            <div className="mb-8 rounded-xl border border-white/10 bg-white/[.06] px-3 py-2 text-xs leading-relaxed text-[#eff3e8]/70">
              {preview
                ? "Vista local: no se guarda información."
                : saveState === "saving"
                  ? "Guardando cambios…"
                  : saveState === "error"
                    ? "No se pudo guardar todavía."
                    : "Cambios guardados automáticamente."}
            </div>
            <ol className="grid gap-2">
              {STEPS.map(([number, title, description], index) => (
                <li key={title}>
                  <button
                    type="button"
                    onClick={() => index <= step && setStep(index)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${step === index ? "bg-white/12" : index < step ? "opacity-85 hover:bg-white/8" : "cursor-default opacity-35"}`}
                  >
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-full border text-[10px] font-bold ${index < step ? "border-[#d8b465] bg-[#d8b465] text-[#17231e]" : "border-white/25"}`}
                    >
                      {index < step ? "✓" : number}
                    </span>
                    <span>
                      <span className="block text-sm font-bold">{title}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-[#eff3e8]/55">
                        {description}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </aside>
        <section className="min-w-0 px-5 py-7 sm:px-9 sm:py-10">
          <header className="mb-8 max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-moss">
              {STEPS[step][0]} · {STEPS[step][1]}
            </p>
            <h1 className="mt-2 font-display text-4xl tracking-tight text-ink">
              {step === 0
                ? "Tu página ya sabe bastante de vos."
                : step === 1
                  ? "Esto fue lo que encontramos."
                  : "Tu espacio está listo para arrancar."}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate/70">
              {step === 0
                ? "Pegá la web y Cafishia preparará una propuesta. Después sólo revisás lo necesario."
                : step === 1
                  ? "Todo es editable. Las etiquetas indican de dónde salió cada dato."
                  : "Confirmá qué información se importará y en qué redes querés empezar a escuchar."}
            </p>
          </header>
          {notice ? (
            <div className="mb-6 rounded-xl border border-brass/25 bg-brass/[.08] px-4 py-3 text-sm text-ink">
              {notice}
            </div>
          ) : null}
          {step === 0 ? (
            <div className="max-w-2xl">
              <div className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm">
                <Field label="URL pública del negocio">
                  <input
                    className={input}
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    onBlur={() => setUrl((current) => normalizeWebsiteUrl(current))}
                    placeholder="tunegocio.com.ar"
                  />
                </Field>
                <button
                  type="button"
                  onClick={analyze}
                  disabled={isAnalyzing}
                  className="mt-5 rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper transition hover:bg-moss disabled:opacity-50"
                >
                  {isAnalyzing
                    ? "Analizando…"
                    : detected
                      ? "Volver a analizar"
                      : "Analizar mi página →"}
                </button>
              </div>
              {isAnalyzing ? (
                <div className="mt-5 rounded-2xl border border-moss/20 bg-moss/[.06] p-5">
                  {analysisStages.map((stage, index) => (
                    <p
                      className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"
                      key={stage}
                    >
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-moss text-[10px] text-paper">
                        {index < analysisStages.length - 1 ? "✓" : "…"}
                      </span>
                      {stage}
                    </p>
                  ))}
                </div>
              ) : null}
              <p className="mt-5 text-xs leading-relaxed text-slate/55">
                Sólo leemos páginas públicas del mismo dominio. No accedemos a
                cuentas, carritos, pedidos ni áreas privadas.
              </p>
            </div>
          ) : null}
          {step === 1 ? (
            <div className="grid max-w-4xl gap-6">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink/10 bg-ink/[.025] px-4 py-3 text-sm">
                <span className="font-bold text-ink">
                  {draft.detectedPlatform}
                </span>
                <span className="text-slate/55">
                  · {draft.stats.pagesRead} páginas leídas ·{" "}
                  {draft.stats.products} productos · {draft.stats.services}{" "}
                  servicios
                </span>
                {draft.warnings.map((warning) => (
                  <span key={warning} className="text-signal">
                    · {warning}
                  </span>
                ))}
              </div>
              <div className="grid gap-4 rounded-2xl border border-ink/10 bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-slate/60">
                  Identidad
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Nombre del negocio"
                    evidence={draft.evidence.name}
                  >
                    <input
                      className={input}
                      value={draft.name}
                      onChange={(event) => setField("name", event.target.value)}
                    />
                  </Field>
                  <Field label="Marca" evidence={draft.evidence.brand}>
                    <input
                      className={input}
                      value={draft.brand}
                      onChange={(event) =>
                        setField("brand", event.target.value)
                      }
                    />
                  </Field>
                </div>
                <Field
                  label="Resumen del negocio"
                  evidence={draft.evidence.description}
                >
                  <textarea
                    className={`${input} min-h-24 resize-y`}
                    value={draft.description}
                    onChange={(event) =>
                      setField("description", event.target.value)
                    }
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Qué vende"
                    evidence={draft.evidence.offer}
                  >
                    <input
                      className={input}
                      value={draft.offer}
                      onChange={(event) =>
                        setField("offer", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Tipo de negocio">
                    <select
                      className={input}
                      value={draft.detectedBusinessType}
                      onChange={(event) =>
                        setField(
                          "detectedBusinessType",
                          event.target.value as
                            | "products"
                            | "services"
                            | "mixed",
                        )
                      }
                    >
                      <option value="products">Productos</option>
                      <option value="services">Servicios</option>
                      <option value="mixed">Productos y servicios</option>
                    </select>
                  </Field>
                </div>
                <Field
                  label="Público objetivo"
                  evidence={draft.evidence.targetAudience}
                >
                  <textarea
                    className={`${input} min-h-20 resize-y`}
                    value={draft.targetAudience}
                    onChange={(event) =>
                      setField("targetAudience", event.target.value)
                    }
                    placeholder="Por ejemplo: corredores y personas activas que buscan medias técnicas para entrenar."
                  />
                </Field>
                <Field
                  label="Objetivos del negocio"
                  evidence={draft.evidence.businessGoals}
                >
                  <textarea
                    className={`${input} min-h-20 resize-y`}
                    value={draft.businessGoals.join("\n")}
                    onChange={(event) =>
                      setField(
                        "businessGoals",
                        event.target.value
                          .split("\n")
                          .map((item) => item.trim())
                          .filter(Boolean)
                          .slice(0, 3),
                      )
                    }
                    placeholder="Un objetivo por línea (máximo 3)"
                  />
                </Field>
              </div>
              {draft.offerings.length ? (
                <div className="rounded-2xl border border-moss/20 bg-moss/[.06] p-5">
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-moss">
                    Catálogo sincronizado
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate/70">
                    Importamos automáticamente lo encontrado en tu sitio para
                    usarlo como contexto al responder consultas.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-white/75 px-4 py-3">
                      <p className="font-display text-2xl text-ink">
                        {draft.stats.importedProducts || productCount}
                      </p>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate/60">
                        Productos importados
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/75 px-4 py-3">
                      <p className="font-display text-2xl text-ink">
                        {draft.stats.importedServices || serviceCount}
                      </p>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate/60">
                        Servicios importados
                      </p>
                    </div>
                  </div>
                  {catalogCategories.length ? (
                    <div className="mt-4 flex flex-wrap gap-2" aria-label="Categorías importadas">
                      {catalogCategories.map((category) => (
                        <span
                          key={category}
                          className="rounded-full bg-white/75 px-3 py-1.5 text-xs font-bold text-slate"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {draft.stats.catalogSyncPending ? (
                    <p className="mt-4 text-sm text-slate/65">
                      Detectamos más páginas de catálogo. La sincronización
                      completa quedará pendiente para continuar después, sin
                      demorar esta configuración.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-ink/20 bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-slate/60">
                    Sin catálogo detectado
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate/65">
                    No encontramos productos ni servicios estructurados. Si te
                    sirve, podés agregar una oferta principal ahora o continuar
                    sin catálogo.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                    <select
                      aria-label="Tipo de oferta principal"
                      className={input}
                      value={manualOfferingKind}
                      onChange={(event) =>
                        setManualOfferingKind(
                          event.target.value as "product" | "service",
                        )
                      }
                    >
                      <option value="product">Producto</option>
                      <option value="service">Servicio</option>
                    </select>
                    <input
                      className={input}
                      value={manualOfferingName}
                      onChange={(event) => setManualOfferingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addManualOffering();
                      }}
                      placeholder="Ej.: Medias técnicas para running"
                    />
                    <button
                      type="button"
                      onClick={addManualOffering}
                      disabled={!manualOfferingName.trim()}
                      className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-moss disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              )}
              <div className="grid gap-4 rounded-2xl border border-ink/10 bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-slate/60">
                  Conocimiento y comunicación
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tono">
                    <input
                      className={input}
                      value={draft.tone}
                      onChange={(event) => setField("tone", event.target.value)}
                    />
                  </Field>
                  <Field label="Temas (separados por coma)">
                    <input
                      className={input}
                      value={draft.topics.join(", ")}
                      onChange={(event) =>
                        setField(
                          "topics",
                          event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </Field>
                </div>
                {draft.knowledge.map((item, index) => (
                  <Field
                    key={index}
                    label={
                      draft.knowledgePrompts[index] ||
                      `Conocimiento ${index + 1}`
                    }
                    evidence={draft.evidence.knowledge}
                  >
                    <textarea
                      className={`${input} min-h-20 resize-y`}
                      value={item}
                      onChange={(event) => {
                        const next = [...draft.knowledge];
                        next[index] = event.target.value;
                        setField("knowledge", next);
                      }}
                    />
                  </Field>
                ))}
              </div>
            </div>
          ) : null}
          {step === 2 ? (
            <div className="grid max-w-3xl gap-5">
              <div className="rounded-3xl border border-moss/25 bg-moss/[.07] p-6">
                <p className="font-display text-3xl text-ink">
                  Listo para activar.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-white/70 p-3">
                    <p className="text-2xl font-display text-ink">
                      {productCount}
                    </p>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate/60">
                      Productos
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/70 p-3">
                    <p className="text-2xl font-display text-ink">
                      {serviceCount}
                    </p>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate/60">
                      Servicios
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/70 p-3">
                    <p className="text-2xl font-display text-ink">
                      {draft.knowledge.filter(Boolean).length}
                    </p>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate/60">
                      Conocimientos
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-ink/10 bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-slate/60">
                  Dónde escuchar
                </p>
                <p className="mt-1 text-sm text-slate/65">
                  Sugerimos las redes detectadas, pero podés elegir sólo las que
                  quieras usar.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {NETWORKS.map((network) => {
                    const selected = draft.selectedNetworks.includes(network);
                    return (
                      <button
                        type="button"
                        key={network}
                        onClick={() =>
                          setField(
                            "selectedNetworks",
                            selected
                              ? draft.selectedNetworks.filter(
                                  (item) => item !== network,
                                )
                              : [...draft.selectedNetworks, network],
                          )
                        }
                        className={`rounded-full border px-3 py-2 text-sm font-bold transition ${selected ? "border-moss bg-moss text-paper" : "border-ink/15 bg-white text-ink"}`}
                      >
                        {selected ? "✓ " : "+ "}
                        {network}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={complete}
                disabled={saveState === "saving"}
                className="w-fit rounded-full bg-ink px-6 py-3 text-sm font-bold text-paper transition hover:bg-moss disabled:opacity-50"
              >
                {preview
                  ? "Ver finalización local"
                  : "Guardar y abrir el panel"}
              </button>
            </div>
          ) : null}
          <footer className="mt-9 flex items-center justify-between border-t border-ink/10 pt-5">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0}
              className="rounded-full px-3 py-2 text-sm font-bold text-slate/60 disabled:opacity-30"
            >
              ← Volver
            </button>
            {step < 2 ? (
              <button
                type="button"
                onClick={() => (step === 0 ? analyze() : setStep(2))}
                disabled={!canContinue || isAnalyzing}
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-paper transition hover:bg-moss disabled:opacity-35"
              >
                {step === 0 ? "Analizar página →" : "Revisar activación →"}
              </button>
            ) : (
              <span />
            )}
          </footer>
        </section>
      </div>
    </main>
  );
}
