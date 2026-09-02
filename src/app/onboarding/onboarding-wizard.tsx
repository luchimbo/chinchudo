"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import type { OnboardingDraft } from "@/lib/onboarding";
import { getOnboardingCompletionIssues } from "@/lib/onboarding-completion";
import {
  reanalysisImpact,
  stepLabelsFor,
  type OnboardingWizardMode,
} from "@/lib/onboarding-wizard-state";

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
type Initial = {
  draft: Required<OnboardingDraft>;
  step: number;
  sourceUrl: string;
  businessType: string;
  status: string;
  analysisError: string;
};
type SaveState = "saved" | "saving" | "error";
type NoticeLevel = "info" | "warning" | "error";
type Notice = {
  level: NoticeLevel;
  message: string;
  action?: { label: string; onClick: () => void };
} | null;

function clientDraft(value?: OnboardingDraft): Required<OnboardingDraft> {
  const raw = value ?? {};
  return {
    name: raw.name || "",
    description: raw.description || "",
    brand: raw.brand || "",
    confirmedBrandId: raw.confirmedBrandId || "",
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
function Field({
  label,
  children,
  fieldId,
  invalid = false,
}: {
  label: string;
  children: React.ReactNode;
  fieldId?: string;
  invalid?: boolean;
}) {
  return (
    <label
      data-onboarding-field={fieldId}
      className={`grid gap-1.5 rounded-xl transition ${invalid ? "bg-signal/[.08] p-2 ring-1 ring-signal/40" : ""}`}
    >
      <span className="text-xs font-bold uppercase tracking-[0.13em] text-slate/70">
        {label}
      </span>
      {children}
    </label>
  );
}

const NOTICE_STYLES: Record<NoticeLevel, { box: string; role: "alert" | "status" }> = {
  info: { box: "border-moss/20 bg-moss/[.06]", role: "status" },
  warning: { box: "border-brass/25 bg-brass/[.08]", role: "status" },
  error: { box: "border-signal/30 bg-signal/[.08]", role: "alert" },
};

export function OnboardingWizard({
  initial,
  preview = false,
  clientName,
  clientSlug,
  mode = "setup",
  completedAt = null,
  returnTo = "panel",
}: {
  initial?: Initial;
  preview?: boolean;
  clientName?: string;
  clientSlug?: string;
  mode?: OnboardingWizardMode;
  completedAt?: string | null;
  returnTo?: "panel" | "configuracion";
}) {
  const router = useRouter();
  const apiUrl = (path: string) =>
    clientSlug ? `${path}?client=${encodeURIComponent(clientSlug)}` : path;
  const STEPS = stepLabelsFor(mode);
  const [step, setStep] = useState(Math.min(initial?.step ?? 0, 2));
  const [url, setUrl] = useState(initial?.sourceUrl || "");
  const [draft, setDraft] = useState<Required<OnboardingDraft>>(() =>
    clientDraft(initial?.draft),
  );
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<Notice>(
    initial?.analysisError
      ? {
          level: "warning",
          message: initial.analysisError,
          action: { label: "Volver a analizar", onClick: () => beginAnalysis() },
        }
      : null,
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStages, setAnalysisStages] = useState<string[]>([]);
  const [reviewAttempted, setReviewAttempted] = useState(false);
  const [manualOfferingName, setManualOfferingName] = useState("");
  const [manualOfferingKind, setManualOfferingKind] = useState<
    "product" | "service"
  >("product");
  const [reanalysisPanelOpen, setReanalysisPanelOpen] = useState(false);
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
  const toggleOfferingSelected = (id: string, selected: boolean) => {
    setDraft((current) => ({
      ...current,
      offerings: current.offerings.map((item) =>
        item.id === id ? { ...item, selected } : item,
      ),
    }));
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
        const patchUrl = clientSlug
          ? `/api/onboarding?client=${encodeURIComponent(clientSlug)}`
          : "/api/onboarding";
        const response = await fetch(patchUrl, {
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
  }, [draft, preview, step, url, clientSlug]);
  const analyze = async () => {
    const normalizedUrl = normalizeWebsiteUrl(url);
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      setNotice({ level: "error", message: "Ingresá una dirección web válida." });
      return;
    }
    setUrl(normalizedUrl);
    setIsAnalyzing(true);
    setNotice(null);
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
      const endpoint = preview ? "/api/onboarding/preview" : apiUrl("/api/onboarding");
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
      setNotice(data.warning ? { level: "warning", message: data.warning } : null);
      setStep(1);
      setSaveState("saved");
    } catch (error) {
      setNotice({
        level: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo analizar el sitio.",
      });
      setSaveState("error");
    } finally {
      window.clearInterval(progress);
      setIsAnalyzing(false);
    }
  };
  function beginAnalysis() {
    if (mode === "edit" && !reanalysisPanelOpen) {
      setReanalysisPanelOpen(true);
      return;
    }
    void analyze();
  }
  const confirmReanalysis = async (alsoReplaceConfirmed: boolean) => {
    setReanalysisPanelOpen(false);
    if (alsoReplaceConfirmed) {
      // "Reemplazar también lo confirmado": quita la protección de mergeManualFields
      // sobre todo lo que no sea una oferta cargada a mano, y lo persiste antes de
      // analizar (el análisis lee el draft ya guardado en el servidor, no este
      // estado local todavía no sincronizado por el autosave con debounce).
      const nextDraft = {
        ...draft,
        manualFields: draft.manualFields.filter((field) => field.startsWith("offering:")),
      };
      setDraft(nextDraft);
      try {
        await fetch(apiUrl("/api/onboarding"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draft: nextDraft,
            sourceUrl: url,
            businessType: nextDraft.detectedBusinessType,
            currentStep: step + 1,
          }),
        });
      } catch {
        // Si falla, el análisis usa el draft previo (protección intacta): no rompe nada.
      }
    }
    void analyze();
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
      const response = await fetch(apiUrl("/api/onboarding"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "No se pudo finalizar la configuración.");
      const target =
        mode === "edit" && returnTo === "configuracion" && clientSlug
          ? `/configuracion?client=${encodeURIComponent(clientSlug)}&onboarding=saved`
          : "/";
      router.push(target);
      router.refresh();
    } catch (error) {
      setSaveState("error");
      setNotice({
        level: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo finalizar. Intentá de nuevo.",
      });
    }
  };
  const selectedOfferings = draft.offerings.filter((item) => item.selected);
  const productCount = selectedOfferings.filter(
      (item) => item.kind === "product",
    ).length,
    serviceCount = selectedOfferings.filter(
      (item) => item.kind === "service",
    ).length;
  const catalogCategories = [
    ...new Set(
      selectedOfferings.map((item) => item.category.trim()).filter(Boolean),
    ),
  ].slice(0, 6);
  const reviewIssues = reviewAttempted
    ? getOnboardingCompletionIssues(draft)
    : [];
  const continueToActivation = () => {
    const issues = getOnboardingCompletionIssues(draft);
    setReviewAttempted(true);
    if (!issues.length) {
      setStep(2);
      return;
    }
    const first = issues[0];
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[data-onboarding-field="${first.key}"] input, [data-onboarding-field="${first.key}"] textarea, [data-onboarding-field="${first.key}"] select`,
        )
        ?.focus();
    });
  };
  const canJumpTo = (index: number) => mode === "edit" || index <= step;
  const goToStep = (index: number) => {
    if (!canJumpTo(index)) return;
    if (index === 2 && getOnboardingCompletionIssues(draft).length) {
      setStep(1);
      continueToActivation();
      return;
    }
    setStep(index);
  };
  const detected = useMemo(
    () => draft.stats.pagesRead > 0,
    [draft.stats.pagesRead],
  );
  const impact = useMemo(() => reanalysisImpact(draft), [draft]);
  const completedAtLabel = useMemo(() => {
    if (!completedAt) return "";
    try {
      return new Date(completedAt).toLocaleDateString("es-AR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }, [completedAt]);
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
                  {mode === "edit"
                    ? `Editando configuración${completedAtLabel ? ` · activada el ${completedAtLabel}` : ""}`
                    : clientName
                      ? `Configuración de ${clientName}`
                      : "Configuración inicial"}
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
              {STEPS.map(([number, title, description], index) => {
                const jumpable = canJumpTo(index);
                return (
                  <li key={title}>
                    <button
                      type="button"
                      onClick={() => goToStep(index)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${step === index ? "bg-white/12" : index < step || jumpable ? "opacity-85 hover:bg-white/8" : "cursor-default opacity-35"}`}
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
                );
              })}
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
                ? mode === "edit"
                  ? "¿Cambió algo en tu sitio?"
                  : "Tu página ya sabe bastante de vos."
                : step === 1
                  ? mode === "edit"
                    ? "Editá tu configuración."
                    : "Revisá tu configuración."
                  : mode === "edit"
                    ? "Confirmá los cambios."
                    : "Tu espacio está listo para arrancar."}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate/70">
              {step === 0
                ? mode === "edit"
                  ? "Podés continuar sin releer el sitio, o pedirle a Cafishia que lo revise de nuevo."
                  : "Pegá la web y Cafishia preparará una propuesta. Después sólo revisás lo necesario."
                : step === 1
                  ? mode === "edit"
                    ? "Esta es tu configuración confirmada. Ajustá sólo lo que quieras cambiar."
                    : "Completamos una propuesta con la información pública de tu negocio. Ajustala para que quede exactamente como querés."
                  : mode === "edit"
                    ? "Revisá qué se va a actualizar y en qué redes querés escuchar."
                    : "Confirmá qué información se importará y en qué redes querés empezar a escuchar."}
            </p>
          </header>
          {notice ? (
            <div
              className={`mb-6 rounded-xl border px-4 py-3 text-sm text-ink ${NOTICE_STYLES[notice.level].box}`}
              role={NOTICE_STYLES[notice.level].role}
            >
              {notice.message}
              {notice.action ? (
                <button
                  type="button"
                  onClick={notice.action.onClick}
                  className="ml-2 font-bold underline underline-offset-2"
                >
                  {notice.action.label}
                </button>
              ) : null}
            </div>
          ) : null}
          {step === 1 && reviewIssues.length ? (
            <div className="mb-6 rounded-2xl border border-signal/30 bg-signal/[.08] px-4 py-3 text-sm text-ink" role="alert">
              <p className="font-bold">Falta completar información para avanzar</p>
              <p className="mt-1 text-slate/75">Completá: {reviewIssues.map((issue) => issue.label).join(", ")}.</p>
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
                  onClick={beginAnalysis}
                  disabled={isAnalyzing}
                  className="mt-5 rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper transition hover:bg-moss disabled:opacity-50"
                >
                  {isAnalyzing
                    ? "Analizando…"
                    : mode === "edit"
                      ? "Volver a leer mi sitio"
                      : detected
                        ? "Volver a analizar"
                        : "Analizar mi página →"}
                </button>
              </div>
              {mode === "edit" && reanalysisPanelOpen ? (
                <div className="mt-5 rounded-2xl border border-brass/25 bg-brass/[.06] p-5">
                  <p className="text-sm font-bold text-ink">¿Volver a leer tu sitio?</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate/70">
                    Nada se guarda en tu configuración hasta que pulses &quot;Guardar cambios&quot;.
                  </p>
                  {impact.keepLabels.length || impact.manualOfferingsCount ? (
                    <div className="mt-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate/55">
                        Se conserva
                      </p>
                      <p className="mt-1 text-sm text-slate/75">
                        {impact.keepLabels.join(", ")}
                        {impact.keepLabels.length && impact.manualOfferingsCount
                          ? " y "
                          : ""}
                        {impact.manualOfferingsCount
                          ? `${impact.manualOfferingsCount} oferta${impact.manualOfferingsCount > 1 ? "s" : ""} cargada${impact.manualOfferingsCount > 1 ? "s" : ""} a mano`
                          : ""}
                        .
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => confirmReanalysis(false)}
                      className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-paper transition hover:bg-moss"
                    >
                      Sí, releer mi sitio
                    </button>
                    <button
                      type="button"
                      onClick={() => setReanalysisPanelOpen(false)}
                      className="rounded-full px-4 py-2 text-sm font-bold text-slate/60"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmReanalysis(true)}
                      className="text-xs font-semibold text-slate/50 underline underline-offset-2 hover:text-signal"
                    >
                      Reemplazar también lo confirmado
                    </button>
                  </div>
                </div>
              ) : null}
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
                  <span key={warning} className="text-brass">
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
                    fieldId="name"
                    invalid={reviewIssues.some((issue) => issue.key === "name")}
                  >
                    <input
                      className={input}
                      value={draft.name}
                      onChange={(event) => setField("name", event.target.value)}
                    />
                  </Field>
                  <Field label="Marca" fieldId="brand" invalid={reviewIssues.some((issue) => issue.key === "brand")}>
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
                    fieldId="description"
                    invalid={reviewIssues.some((issue) => issue.key === "description")}
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
                    label="Oferta principal"
                    fieldId="offer"
                    invalid={reviewIssues.some((issue) => issue.key === "offer")}
                  >
                    <input
                      className={input}
                      value={draft.offer}
                      onChange={(event) =>
                        setField("offer", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Tipo de negocio" fieldId="detectedBusinessType">
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
                    fieldId="targetAudience"
                    invalid={reviewIssues.some((issue) => issue.key === "targetAudience")}
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
                    fieldId="businessGoals"
                    invalid={reviewIssues.some((issue) => issue.key === "businessGoals")}
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
                    Catálogo candidato
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate/70">
                    Esto es lo que encontramos en tu sitio. Se importa lo que
                    dejes tildado recién cuando confirmás y activás tu espacio.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-white/75 px-4 py-3">
                      <p className="font-display text-2xl text-ink">
                        {productCount}
                      </p>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate/60">
                        Productos a importar
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/75 px-4 py-3">
                      <p className="font-display text-2xl text-ink">
                        {serviceCount}
                      </p>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate/60">
                        Servicios a importar
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
                  <div className="mt-4 max-h-56 overflow-y-auto rounded-xl bg-white/70">
                    {draft.offerings.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 border-b border-ink/5 px-3 py-2 text-sm last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(event) =>
                            toggleOfferingSelected(item.id, event.target.checked)
                          }
                          className="h-4 w-4 rounded border-ink/25"
                        />
                        <span className="flex-1 truncate text-ink">{item.name}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate/45">
                          {item.kind === "product" ? "Producto" : "Servicio"}
                        </span>
                      </label>
                    ))}
                  </div>
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
                  <Field label="Tono" fieldId="tone" invalid={reviewIssues.some((issue) => issue.key === "tone")}>
                    <input
                      className={input}
                      value={draft.tone}
                      onChange={(event) => setField("tone", event.target.value)}
                    />
                  </Field>
                  <Field label="Temas (separados por coma)" fieldId="topics" invalid={reviewIssues.some((issue) => issue.key === "topics")}>
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
                    fieldId={`knowledge-${index}`}
                    invalid={reviewIssues.some((issue) => issue.key === `knowledge-${index}`)}
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
                  {mode === "edit" ? "Cambios listos para guardar." : "Listo para activar."}
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
                  : mode === "edit"
                    ? "Guardar cambios"
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
                onClick={() =>
                  step === 0
                    ? mode === "edit"
                      ? setStep(1)
                      : void analyze()
                    : continueToActivation()
                }
                disabled={isAnalyzing}
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-paper transition hover:bg-moss disabled:opacity-35"
              >
                {step === 0
                  ? mode === "edit"
                    ? "Continuar sin releer →"
                    : "Analizar página →"
                  : mode === "edit"
                    ? "Revisar cambios →"
                    : "Revisar activación →"}
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
