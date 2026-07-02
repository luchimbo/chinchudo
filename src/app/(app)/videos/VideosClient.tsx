"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Client, Trend, Product, Persona, VideoScript } from "@prisma/client";

type ScopedScript = VideoScript & {
  product: Product | null;
  persona: Persona;
  trend: { title: string } | null;
};

type VideosClientProps = {
  activeClient: Client;
  clients: Client[];
  trends: Trend[];
  products: (Product & { brand: { name: string } })[];
  personas: Persona[];
  scripts: ScopedScript[];
};

const PRESET_AVATARS = [
  {
    name: "Tomás (Técnico)",
    url: "https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"
  },
  {
    name: "Lucas (Baterista)",
    url: "https://images.pexels.com/photos/1043473/pexels-photo-1043473.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"
  },
  {
    name: "Elena (Trend)",
    url: "https://images.pexels.com/photos/3763188/pexels-photo-3763188.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"
  },
  {
    name: "Sofía (Profe)",
    url: "https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"
  },
  {
    name: "Martín (Ofertas)",
    url: "https://images.pexels.com/photos/2287252/pexels-photo-2287252.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"
  }
];

const getCategoryImageUrl = (category: string) => {
  const c = category.toLowerCase();
  if (c.includes("piano") || c.includes("órgano") || c.includes("organo")) {
    return "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&q=80&w=400";
  }
  if (c.includes("midi") || c.includes("controlador")) {
    return "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&q=80&w=400";
  }
  if (c.includes("auric") || c.includes("audífono") || c.includes("headphone")) {
    return "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=400";
  }
  if (c.includes("micr") || c.includes("grabador") || c.includes("vocoder")) {
    return "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=400";
  }
  if (c.includes("bater") || c.includes("drum") || c.includes("percus")) {
    return "https://images.unsplash.com/photo-1524230572899-a752b3835840?auto=format&fit=crop&q=80&w=400";
  }
  return "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=400";
};

export default function VideosClient({
  activeClient,
  clients,
  trends,
  products,
  personas,
  scripts,
}: VideosClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"trends" | "scripts" | "gallery">("trends");
  
  // Estados locales para interactividad rápida
  const [localScripts, setLocalScripts] = useState<ScopedScript[]>(scripts);
  const [localTrends, setLocalTrends] = useState<Trend[]>(trends);

  // Estados de modales y formularios
  const [showManualModal, setShowManualModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedTrend, setSelectedTrend] = useState<Trend | null>(null);

  // Formulario de guion
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedPersona, setSelectedPersona] = useState("");
  const [generating, setGenerating] = useState(false);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  // Formulario manual de tendencias
  const [manualTitle, setManualTitle] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualPlatform, setManualPlatform] = useState("TWITTER");
  const [savingManual, setSavingManual] = useState(false);
  const [modalMode, setModalMode] = useState<"TREND" | "VIRAL" | "ARTICLE">("TREND");
  const [savingScript, setSavingScript] = useState(false);

  // Editor de guion existente
  const [editingScript, setEditingScript] = useState<ScopedScript | null>(null);
  const [editHook, setEditHook] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCta, setEditCta] = useState("");
  const [editVisuals, setEditVisuals] = useState("");
  const [editAudio, setEditAudio] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editVoiceId, setEditVoiceId] = useState("");
  const [editVoiceStyle, setEditVoiceStyle] = useState("Default");
  const [editBgType, setEditBgType] = useState("default");
  const [editBgColor, setEditBgColor] = useState("");
  const [editStitch, setEditStitch] = useState(true);
  const [editRate, setEditRate] = useState("1.0");
  const [editPitch, setEditPitch] = useState("0%");
  const [editPauseDuration, setEditPauseDuration] = useState(1000);
  const [editStyleDegree, setEditStyleDegree] = useState(1.0);
  const [editPadAudio, setEditPadAudio] = useState(1.0);
  const [editElevenLabsVoiceId, setEditElevenLabsVoiceId] = useState("");
  const [editExpressionHook, setEditExpressionHook] = useState("happy");
  const [editExpressionBody, setEditExpressionBody] = useState("serious");
  const [editExpressionCta, setEditExpressionCta] = useState("happy");
  const [editImgHook, setEditImgHook] = useState("");
  const [editImgBody, setEditImgBody] = useState("");
  const [editImgCta, setEditImgCta] = useState("");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [renderingId, setRenderingId] = useState<string | null>(null);

  // Estado del overlay/modal de renderizado en tiempo real
  const [renderingOverlayScriptId, setRenderingOverlayScriptId] = useState<string | null>(null);
  const [renderingOverlayStatus, setRenderingOverlayStatus] = useState<string | null>(null);
  const [renderingOverlayVideoUrl, setRenderingOverlayVideoUrl] = useState<string | null>(null);
  const [renderingOverlayError, setRenderingOverlayError] = useState<string | null>(null);

  // Progreso en tiempo real y segundo plano
  const [renderingProgress, setRenderingProgress] = useState(0);
  const [renderingStatusText, setRenderingStatusText] = useState("");
  const [showFullscreenOverlay, setShowFullscreenOverlay] = useState(true);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Limpiar interval al desmontar
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  // Sincronizar props con estado local al cambiar de cliente
  useEffect(() => {
    setLocalScripts(scripts);
    setLocalTrends(trends);
  }, [scripts, trends]);

  // Polling automático para chequear videos en renderizado
  useEffect(() => {
    const renderingScripts = localScripts.filter((s) => (s.status === "RENDERING" || s.status === "COMPOSING") && s.avatarJobId);
    if (renderingScripts.length === 0) return;

    const interval = setInterval(async () => {
      for (const script of renderingScripts) {
        try {
          const res = await fetch(`/api/videos?action=status&scriptId=${script.id}`);
          const data = await res.json();
          if (data.success && (data.status === "COMPLETED" || data.status === "COMPOSING" || data.status === "FAILED")) {
            setLocalScripts((prev) =>
              prev.map((s) =>
                s.id === script.id
                  ? {
                      ...s,
                      avatarStatus: data.status,
                      avatarVideoUrl: data.videoUrl || "",
                      status: data.status === "COMPLETED" ? "READY" : data.status === "COMPOSING" ? "COMPOSING" : "FAILED",
                    }
                  : s
              )
            );
          }
        } catch (err) {
          console.error("Error al consultar el estado del render:", err);
        }
      }
    }, 6000);

    return () => clearInterval(interval);
  }, [localScripts]);

  // Manejar cambio de cliente (selector superior)
  const handleClientChange = (slug: string) => {
    router.push(`/videos?client=${slug}`);
  };

  // Crear guion
  const handleGenerateScript = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrend || !selectedProduct || !selectedPersona) return;

    setGenerating(true);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          trendId: selectedTrend.id,
          productId: selectedProduct,
          personaId: selectedPersona,
          clientId: activeClient.id,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Refrescar datos
        router.refresh();
        setShowGenerateModal(false);
        setActiveTab("scripts");
        setSelectedTrend(null);
      } else {
        alert(data.error || "Ocurrió un error al generar el guion.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión.");
    } finally {
      setGenerating(false);
    }
  };

  // Crear tendencia manualmente
  const handleCreateManualTrend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle) return;

    let platform = manualPlatform;
    let metadata: any = { manual: true };
    let description = manualDesc;

    if (modalMode === "VIRAL") {
      platform = "VIRAL_CLONE";
      metadata.isViralTemplate = true;
      metadata.originalDynamics = manualDesc;
    } else if (modalMode === "ARTICLE") {
      platform = "URL_ARTICLE";
      metadata.isArticle = true;
    }

    setSavingManual(true);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_manual_trend",
          title: manualTitle,
          description,
          sourceUrl: manualUrl,
          platform,
          clientId: activeClient.id,
          metadata
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.refresh();
        setShowManualModal(false);
        setManualTitle("");
        setManualDesc("");
        setManualUrl("");
        setModalMode("TREND");
      } else {
        alert(data.error || "Error al crear la tendencia.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingManual(false);
    }
  };

  // Abrir editor
  const openEditor = (script: ScopedScript) => {
    setEditingScript(script);
    setEditHook(script.hook);
    setEditBody(script.bodyText);
    setEditCta(script.cta);
    setEditAudio(script.audioPrompt || "");
    setEditAvatarUrl(script.persona.avatarUrl || "");
    setEditVoiceId(script.persona.voiceId || "es-AR-TomasNeural");
    setEditVoiceStyle("Default");
    setEditBgType("default");
    setEditBgColor("");
    setEditStitch(true);
    setEditRate("1.0");
    setEditPitch("0%");
    setEditPauseDuration(1000);
    setEditStyleDegree(1.0);
    setEditPadAudio(1.0);
    setEditElevenLabsVoiceId("");
    setEditExpressionHook("happy");
    setEditExpressionBody("serious");
    setEditExpressionCta("happy");

    // Parsear visualCues si contiene JSON con imágenes
    let textPart = script.visualCues || "";
    let imgH = "";
    let imgB = "";
    let imgC = "";
    try {
      const parsed = JSON.parse(script.visualCues);
      textPart = parsed.text || "";
      imgH = parsed.imgHook || "";
      imgB = parsed.imgBody || "";
      imgC = parsed.imgCta || "";
    } catch {
      // No era JSON
    }
    setEditVisuals(textPart);
    setEditImgHook(imgH);
    setEditImgBody(imgB);
    setEditImgCta(imgC);

    setShowAdvancedSettings(false);
  };

  // Simulación de progreso de carga en tiempo real (0% a 92%)
  const startProgressSimulation = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    
    setRenderingProgress(0);
    setRenderingStatusText("Inicializando renderizado local...");

    const startTime = Date.now();
    const duration = 16000; // Simular 16 segundos para llegar al 92%

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      let pct = Math.floor((elapsed / duration) * 92);
      if (pct > 92) pct = 92;

      setRenderingProgress(pct);

    if (pct < 15) {
        setRenderingStatusText("Inicializando renderizado local...");
      } else if (pct >= 15 && pct < 45) {
        setRenderingStatusText("Procesando audio y voz en off neural...");
      } else if (pct >= 45 && pct < 75) {
        setRenderingStatusText("Generando voz y procesando presentador...");
      } else if (pct >= 75 && pct < 92) {
        setRenderingStatusText("Mezclando audio con video de presentador...");
      } else {
        setRenderingStatusText("Completando procesamiento de presentador...");
      }
    }, 250);

    progressIntervalRef.current = interval;
  };

  const stopProgressSimulation = (success: boolean) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (success) {
      setRenderingProgress(100);
      setRenderingStatusText("¡Video renderizado con éxito!");
    } else {
      setRenderingProgress(0);
      setRenderingStatusText("Fallo en la renderización.");
    }
  };

  // Renderizar video con el proveedor configurado
  const triggerRender = async (
    scriptId: string,
    avatarUrlOverride?: string,
    voiceIdOverride?: string,
    voiceStyleOverride?: string,
    bgTypeOverride?: string,
    bgColorOverride?: string,
    stitchOverride?: boolean,
    rateOverride?: string,
    pitchOverride?: string,
    pauseDurationOverride?: number,
    styleDegreeOverride?: number,
    padAudioOverride?: number,
    elevenLabsVoiceIdOverride?: string,
    expressionHookOverride?: string,
    expressionBodyOverride?: string,
    expressionCtaOverride?: string
  ) => {
    setRenderingId(scriptId);

    // Abrir el overlay de progreso real-time
    setRenderingOverlayScriptId(scriptId);
    setRenderingOverlayStatus("PROCESSING");
    setRenderingOverlayVideoUrl(null);
    setRenderingOverlayError(null);
    setShowFullscreenOverlay(true); // Mostrar en pantalla completa

    // Iniciar simulación de progreso
    startProgressSimulation();

    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "render",
          scriptId,
          avatarUrl: avatarUrlOverride,
          voiceId: voiceIdOverride,
          voiceStyle: voiceStyleOverride,
          bgType: bgTypeOverride,
          bgColor: bgColorOverride,
          stitch: stitchOverride,
          rate: rateOverride,
          pitch: pitchOverride,
          pauseDuration: pauseDurationOverride,
          styleDegree: styleDegreeOverride,
          padAudio: padAudioOverride,
          elevenLabsVoiceId: elevenLabsVoiceIdOverride,
          expressionHook: expressionHookOverride,
          expressionBody: expressionBodyOverride,
          expressionCta: expressionCtaOverride,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setLocalScripts((prev) =>
          prev.map((s) =>
            s.id === scriptId
              ? { ...s, status: "RENDERING", avatarStatus: "PROCESSING", avatarJobId: data.jobId }
              : s
          )
        );
        setEditingScript(null);
        setActiveTab("scripts");

        // Iniciar polling dedicado para este overlay
        startOverlayPolling(scriptId);
      } else {
        const errMsg = data.error || "No se pudo iniciar el renderizado.";
        stopProgressSimulation(false);
        setRenderingOverlayStatus("FAILED");
        setRenderingOverlayError(errMsg);
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = "Error al conectar con la API.";
      stopProgressSimulation(false);
      setRenderingOverlayStatus("FAILED");
      setRenderingOverlayError(errMsg);
    } finally {
      setRenderingId(null);
    }
  };

  // Polling dedicado y rápido para el modal de carga en tiempo real
  const startOverlayPolling = (scriptId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 240) { // Límite de 10 minutos (240 * 2.5s)
        clearInterval(interval);
        stopProgressSimulation(false);
        setRenderingOverlayStatus("FAILED");
        setRenderingOverlayError("El renderizado excedió el tiempo límite de espera (10 minutos).");
        return;
      }

      try {
        const res = await fetch(`/api/videos?action=status&scriptId=${scriptId}`);
        const data = await res.json();

        if (data.success) {
          if (data.status === "COMPLETED") {
            clearInterval(interval);
            stopProgressSimulation(true);
            setRenderingOverlayStatus("COMPLETED");
            setRenderingOverlayVideoUrl(data.videoUrl || null);

            setLocalScripts((prev) =>
              prev.map((s) =>
                s.id === scriptId
                  ? {
                      ...s,
                      avatarStatus: "COMPLETED",
                      avatarVideoUrl: data.videoUrl || "",
                      status: "READY",
                    }
                  : s
              )
            );
          } else if (data.status === "COMPOSING") {
            setRenderingOverlayStatus("COMPOSING");
            setLocalScripts((prev) =>
              prev.map((s) =>
                s.id === scriptId
                  ? {
                      ...s,
                      status: "COMPOSING",
                    }
                  : s
              )
            );
          } else if (data.status === "FAILED") {
            clearInterval(interval);
            stopProgressSimulation(false);
            setRenderingOverlayStatus("FAILED");
            setRenderingOverlayError(data.error || "El procesamiento del video falló.");
          }
        }
      } catch (err) {
        console.error("Error en polling de overlay:", err);
      }
    }, 2500);
  };

  // Guardar cambios del guion
  const handleSaveScript = async (scriptId: string) => {
    setSavingScript(true);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_script",
          scriptId,
          hook: editHook,
          bodyText: editBody,
          cta: editCta,
          visualCues: JSON.stringify({
            text: editVisuals,
            imgHook: editImgHook,
            imgBody: editImgBody,
            imgCta: editImgCta,
          }),
          audioPrompt: editAudio,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setLocalScripts((prev) =>
          prev.map((s) =>
            s.id === scriptId
              ? {
                  ...s,
                  hook: editHook,
                  bodyText: editBody,
                  cta: editCta,
                  visualCues: JSON.stringify({
                    text: editVisuals,
                    imgHook: editImgHook,
                    imgBody: editImgBody,
                    imgCta: editImgCta,
                  }),
                  audioPrompt: editAudio,
                }
              : s
          )
        );
        return true;
      } else {
        alert(data.error || "No se pudieron guardar los cambios.");
        return false;
      }
    } catch (err) {
      console.error(err);
      alert("Error al guardar cambios.");
      return false;
    } finally {
      setSavingScript(false);
    }
  };

  // Subida de imagen al servidor local
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: "hook" | "body" | "cta") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        if (target === "hook") setEditImgHook(data.url);
        else if (target === "body") setEditImgBody(data.url);
        else if (target === "cta") setEditImgCta(data.url);
      } else {
        alert(data.error || "Fallo al subir la imagen");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al subir la imagen");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8">
      {/* Header */}
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-ink">Videos IA</h1>
          <p className="mt-0.5 text-sm text-slate">
            Crea guiones y renderiza avatares animados basados en tendencias para Argentina.
          </p>
        </div>

        {/* Client selector */}
        {clients.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate">Cliente activo:</span>
            <select
              value={activeClient.slug}
              onChange={(e) => handleClientChange(e.target.value)}
              className="rounded-lg border border-ink/10 bg-paper px-3 py-1.5 text-sm font-semibold text-ink shadow-sm focus:border-ink focus:outline-none"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* Tabs Menu */}
      <div className="mb-6 border-b border-ink/10">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => {
              setActiveTab("trends");
              setEditingScript(null);
            }}
            className={`pb-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "trends"
                ? "border-ink text-ink"
                : "border-transparent text-slate hover:text-ink"
            }`}
          >
            Radar de Tendencias ({localTrends.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("scripts");
              setEditingScript(null);
            }}
            className={`pb-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "scripts"
                ? "border-ink text-ink"
                : "border-transparent text-slate hover:text-ink"
            }`}
          >
            Guiones y Edición ({localScripts.filter((s) => s.status !== "READY").length})
          </button>
          <button
            onClick={() => {
              setActiveTab("gallery");
              setEditingScript(null);
            }}
            className={`pb-3 text-sm font-semibold border-b-2 transition ${
              activeTab === "gallery"
                ? "border-ink text-ink"
                : "border-transparent text-slate hover:text-ink"
            }`}
          >
            Galería de Videos ({localScripts.filter((s) => s.status === "READY").length})
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <main>
        {/* TAB 1: RADAR DE TENDENCIAS */}
        {activeTab === "trends" && (
          <div>
            <div className="mb-6 flex justify-between">
              <h2 className="text-lg font-bold text-ink">Tendencias detectadas en Argentina</h2>
              <button
                onClick={() => setShowManualModal(true)}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper shadow-sm hover:bg-ink/90"
              >
                + Cargar Enlace / Idea
              </button>
            </div>

            {localTrends.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ink/20 py-12 text-center">
                <p className="text-sm text-slate">No hay tendencias registradas. Corre el agente de escucha.</p>
                <p className="mt-1 text-xs text-slate/60">`npm run agents:trend-listen` en tu consola.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {localTrends.map((trend) => (
                  <div
                    key={trend.id}
                    className="flex flex-col justify-between rounded-xl border border-ink/10 bg-paper p-5 shadow-sm hover:shadow"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            trend.platform === "TIKTOK"
                              ? "bg-slate-900 text-white"
                              : trend.platform === "GOOGLE_TRENDS"
                              ? "bg-blue-100 text-blue-800"
                              : trend.platform === "TWITTER"
                              ? "bg-sky-100 text-sky-800"
                              : trend.platform === "VIRAL_CLONE"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : trend.platform === "URL_ARTICLE"
                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {trend.platform === "VIRAL_CLONE"
                            ? "🎬 Clon Viral"
                            : trend.platform === "URL_ARTICLE"
                            ? "📄 Ficha / URL"
                            : trend.platform}
                        </span>
                        <span className="text-[10px] text-slate/50">
                          {new Date(trend.createdAt).toLocaleDateString("es-AR")}
                        </span>
                      </div>
                      <h3 className="mt-3 font-semibold text-ink leading-snug">{trend.title}</h3>
                      <p className="mt-1 text-xs text-slate/75 line-clamp-3">{trend.description}</p>
                      {trend.queryUsed && (
                        <p className="mt-2 text-[10px] font-medium text-slate">
                          Keyword matched: <span className="font-semibold text-ink">{trend.queryUsed}</span>
                        </p>
                      )}
                    </div>
                    <div className="mt-5 flex gap-2 border-t border-ink/5 pt-4">
                      <button
                        onClick={() => {
                          setSelectedTrend(trend);
                          setShowGenerateModal(true);
                          if (products.length > 0) setSelectedProduct(products[0].id);
                          if (personas.length > 0) setSelectedPersona(personas[0].id);
                        }}
                        className="w-full rounded-lg border border-ink/15 py-1.5 text-xs font-semibold text-ink hover:bg-ink/[0.03]"
                      >
                        Crear Guion IA
                      </button>
                      {trend.sourceUrl && (
                        <a
                          href={trend.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-ink/10 p-1.5 text-slate hover:bg-ink/[0.03]"
                          title="Ver fuente original"
                        >
                          🔗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: GUIONES Y EDICION */}
        {activeTab === "scripts" && (
          <div>
            {!editingScript ? (
              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-bold text-ink">Guiones pendientes de renderizado</h2>
                {localScripts.filter((s) => s.status !== "READY").length === 0 ? (
                  <p className="text-sm text-slate">No hay guiones pendientes. Generá uno desde la solapa de Tendencias.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {localScripts
                      .filter((s) => s.status !== "READY")
                      .map((script) => (
                        <div
                          key={script.id}
                          className="rounded-xl border border-ink/10 bg-paper p-5 shadow-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/5 pb-3">
                            <div>
                              <p className="text-[10px] text-slate/50">
                                Tendencia: <span className="font-semibold text-ink">{script.trend?.title || "Carga manual"}</span>
                              </p>
                              <div className="mt-1 flex gap-2">
                                <span className="rounded-md bg-ink/5 px-2 py-0.5 text-xs text-slate">
                                  Producto: {script.product?.name || "Catálogo"}
                                </span>
                                <span className="rounded-md bg-brass/10 px-2 py-0.5 text-xs text-brass">
                                  Voz: {script.persona.name}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                script.status === "RENDERING" || script.status === "COMPOSING"
                                  ? "bg-amber-100 text-amber-800 animate-pulse"
                                  : script.status === "FAILED"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-blue-50 text-blue-800"
                              }`}
                            >
                              {script.status === "RENDERING"
                                ? "Procesando Presentador..."
                                : script.status === "COMPOSING"
                                ? "Componiendo Video Local..."
                                : script.status === "FAILED"
                                ? "Falló Render"
                                : "Borrador Listo"}
                            </span>
                          </div>

                          <div className="mt-4">
                            <p className="text-xs font-bold text-slate uppercase tracking-wider">Guion Narrativo:</p>
                            <blockquote className="mt-2 border-l-2 border-ink/10 pl-3 text-sm italic text-slate/85">
                              &ldquo;{script.hook} {script.bodyText} {script.cta}&rdquo;
                            </blockquote>
                          </div>

                          <div className="mt-5 flex gap-2 justify-end">
                            {script.status === "RENDERING" || script.status === "COMPOSING" ? (
                              <button
                                disabled
                                className="rounded-lg bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate/50 cursor-not-allowed"
                              >
                                Procesando... ⌛
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => openEditor(script)}
                                  className="rounded-lg border border-ink/15 px-4 py-1.5 text-xs font-semibold text-ink hover:bg-ink/[0.03]"
                                >
                                  Editar Guion
                                </button>
                                <button
                                  onClick={() => triggerRender(script.id)}
                                  disabled={renderingId === script.id}
                                  className="rounded-lg bg-ink px-4 py-1.5 text-xs font-semibold text-paper hover:bg-ink/90 shadow-sm"
                                >
                                  {renderingId === script.id ? "Iniciando..." : "Renderizar Video"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              /* EDITOR DE GUION */
              <div className="rounded-xl border border-ink/10 bg-paper p-6 shadow-sm">
                <header className="mb-5 flex justify-between border-b border-ink/5 pb-3">
                  <div>
                    <h3 className="font-bold text-ink">Editor de Storyboard IA</h3>
                    <p className="text-xs text-slate">Persona: {editingScript.persona.name}</p>
                  </div>
                  <button
                    onClick={() => setEditingScript(null)}
                    className="text-xs text-slate hover:text-ink font-semibold"
                  >
                    ← Volver
                  </button>
                </header>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate uppercase">Gancho (3s):</label>
                    <textarea
                      value={editHook}
                      onChange={(e) => setEditHook(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-ink/10 bg-white p-3 text-sm text-ink focus:border-ink focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate uppercase">Desarrollo (15-30s):</label>
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={5}
                      className="mt-1 w-full rounded-lg border border-ink/10 bg-white p-3 text-sm text-ink focus:border-ink focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate uppercase">Llamado a la acción (5s):</label>
                    <textarea
                      value={editCta}
                      onChange={(e) => setEditCta(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-ink/10 bg-white p-3 text-sm text-ink focus:border-ink focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate uppercase">Indicaciones visuales (Sugerencias):</label>
                    <textarea
                      value={editVisuals}
                      onChange={(e) => setEditVisuals(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-ink/10 bg-white p-3 text-sm text-ink focus:border-ink focus:outline-none"
                    />
                  </div>

                  {/* IMAGENES DE LAS TRES ETAPAS */}
                  <div className="border-t border-ink/5 pt-4 mt-2">
                    <label className="block text-xs font-bold text-slate uppercase">Imágenes Reales del Video Comercial (Gancho, Desarrollo, CTA):</label>
                    <p className="text-[10px] text-slate/60 mt-0.5 font-medium">Subí las fotos del producto para cada etapa.</p>
                    
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {/* Imagen Gancho */}
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-bold text-slate mb-1">1. Gancho (Inicio)</span>
                        <div className="relative h-20 w-full border-2 border-dashed border-ink/15 rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center">
                          {editImgHook ? (
                            <>
                              <img src={editImgHook} alt="Gancho" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setEditImgHook("")}
                                className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full h-4 w-4 flex items-center justify-center text-[8px] transition font-bold"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center text-center p-1 hover:bg-ink/[0.02]">
                              <span className="text-lg">📤</span>
                              <span className="text-[9px] font-bold text-slate mt-0.5">Subir Foto</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleImageUpload(e, "hook")}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      {/* Imagen Desarrollo */}
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-bold text-slate mb-1">2. Desarrollo</span>
                        <div className="relative h-20 w-full border-2 border-dashed border-ink/15 rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center">
                          {editImgBody ? (
                            <>
                              <img src={editImgBody} alt="Desarrollo" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setEditImgBody("")}
                                className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full h-4 w-4 flex items-center justify-center text-[8px] transition font-bold"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center text-center p-1 hover:bg-ink/[0.02]">
                              <span className="text-lg">📤</span>
                              <span className="text-[9px] font-bold text-slate mt-0.5">Subir Foto</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleImageUpload(e, "body")}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      {/* Imagen CTA */}
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-bold text-slate mb-1">3. CTA (Cierre)</span>
                        <div className="relative h-20 w-full border-2 border-dashed border-ink/15 rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center">
                          {editImgCta ? (
                            <>
                              <img src={editImgCta} alt="CTA" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setEditImgCta("")}
                                className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full h-4 w-4 flex items-center justify-center text-[8px] transition font-bold"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center text-center p-1 hover:bg-ink/[0.02]">
                              <span className="text-lg">📤</span>
                              <span className="text-[9px] font-bold text-slate mt-0.5">Subir Foto</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleImageUpload(e, "cta")}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SELECTOR DE MUSICA DE FONDO */}
                  <div>
                    <label className="block text-xs font-bold text-slate uppercase">Música de Fondo:</label>
                    <select
                      value={editAudio}
                      onChange={(e) => setEditAudio(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-brass focus:outline-none font-medium"
                    >
                      <option value="default">Default / Sin Música Especial</option>
                      <option value="https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3">Mixkit Tech House Vibes (Enérgico) 🕺</option>
                      <option value="https://assets.mixkit.co/music/preview/mixkit-lofi-band-929.mp3">Mixkit Lo-Fi Chill (Relajante) ☕</option>
                      <option value="https://assets.mixkit.co/music/preview/mixkit-hip-hop-02-738.mp3">Mixkit Hip Hop Beat (Moderno) 🎧</option>
                      <option value="https://assets.mixkit.co/music/preview/mixkit-guitar-groove-2200.mp3">Mixkit Guitar Groove (Acústico) 🎸</option>
                    </select>
                    <p className="text-[10px] text-slate/60 mt-1">Esta pista se mezclará en segundo plano al compilar el video.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 border-t border-ink/5 pt-4 mt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate uppercase">Seleccionar Presentador (Avatar):</label>
                      <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 max-w-full">
                        {PRESET_AVATARS.map((avatar) => (
                          <button
                            key={avatar.name}
                            type="button"
                            onClick={() => setEditAvatarUrl(avatar.url)}
                            className={`flex flex-col items-center shrink-0 p-1.5 rounded-lg border transition ${
                              editAvatarUrl === avatar.url 
                                ? "border-brass bg-brass/5" 
                                : "border-ink/5 hover:border-ink/20 bg-white"
                            }`}
                          >
                            <img 
                              src={avatar.url} 
                              alt={avatar.name} 
                              className="h-8 w-8 rounded-full object-cover shadow-sm"
                            />
                            <span className="text-[9px] font-semibold text-ink mt-0.5">{avatar.name.split(" ")[0]}</span>
                          </button>
                        ))}
                      </div>

                      {/* Vista Previa del Avatar */}
                      <div className="flex items-center gap-3 border border-ink/10 rounded-lg p-2 bg-slate-50 mt-2">
                        {editAvatarUrl ? (
                          <>
                            <img 
                              src={editAvatarUrl} 
                              alt="Preview Avatar" 
                              className="h-10 w-10 rounded-full object-cover border border-ink/15 shadow-sm shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg";
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-bold text-ink">Vista previa del avatar</span>
                              <input 
                                type="text"
                                value={editAvatarUrl}
                                onChange={(e) => setEditAvatarUrl(e.target.value)}
                                className="mt-0.5 w-full rounded border border-ink/10 bg-white px-2 py-0.5 text-[10px] text-ink focus:border-brass focus:outline-none"
                                placeholder="Pegar URL de imagen..."
                              />
                            </div>
                          </>
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-ink/5 border border-dashed border-ink/20 flex items-center justify-center text-[9px] text-slate font-bold">
                            Sin Foto
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate uppercase">Personalizar Voz (Microsoft Neural ID):</label>
                        <select
                          value={editVoiceId}
                          onChange={(e) => setEditVoiceId(e.target.value)}
                          className="mt-1.5 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none font-medium"
                        >
                          <option value="es-AR-TomasNeural">Argentina - Tomás (Masculino)</option>
                          <option value="es-AR-ElenaNeural">Argentina - Elena (Femenino)</option>
                          <option value="es-MX-JorgeNeural">México - Jorge (Masculino)</option>
                          <option value="es-MX-DaliaNeural">México - Dalia (Femenino)</option>
                          <option value="es-ES-AlvaroNeural">España - Álvaro (Masculino)</option>
                          <option value="es-ES-ElviraNeural">España - Elvira (Femenino)</option>
                        </select>
                        <p className="text-[10px] text-slate/60 mt-1">Reemplaza la voz por defecto de esta persona.</p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate uppercase">Estilo de Voz (Tono / Emoción):</label>
                        <select
                          value={editVoiceStyle}
                          onChange={(e) => setEditVoiceStyle(e.target.value)}
                          className="mt-1.5 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none font-medium"
                        >
                          <option value="Default">Estándar (Neutral)</option>
                          <option value="Cheerful">Alegre / Entusiasmado 😊</option>
                          <option value="Friendly">Cálido / Amigable 🤝</option>
                          <option value="Chat">Natural / Conversacional 🗣️</option>
                          <option value="Newscast">Profesional / Informativo 🎙️</option>
                          <option value="CustomerService">Atención al Cliente 🎧</option>
                        </select>
                        <p className="text-[10px] text-slate/60 mt-1">Aplica un matiz emocional a la locución (si la voz lo soporta).</p>
                      </div>
                    </div>
                  </div>

                  {/* ACORDEON DE AJUSTES AVANZADOS */}
                  <div className="border-t border-ink/10 pt-4 mt-4">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                      className="flex items-center justify-between w-full py-2 text-xs font-bold text-ink hover:text-brass uppercase tracking-wider focus:outline-none"
                    >
                      <span>⚙️ Ajustes Avanzados de Video y Voz (Chroma Key & SSML)</span>
                      <span>{showAdvancedSettings ? "▲ Ocultar" : "▼ Mostrar"}</span>
                    </button>

                    {showAdvancedSettings && (
                      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 bg-slate-50 p-4 rounded-xl border border-ink/5 animate-fade-in text-left">
                        {/* Panel 1: Video y Fondo */}
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold text-ink border-b border-ink/5 pb-1">1. Fondo y Comportamiento Visual</h4>
                          
                          <div>
                            <label className="block text-[10px] font-bold text-slate uppercase">Fondo del Presentador (Chroma Key):</label>
                            <select
                              value={editBgType}
                              onChange={(e) => setEditBgType(e.target.value)}
                              className="mt-1 w-full rounded border border-ink/10 bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:border-brass font-medium"
                            >
                              <option value="default">Foto Original (Por Defecto)</option>
                              <option value="chroma-green">Pantalla Verde (Verde Puro #00FF00) 🟢</option>
                              <option value="chroma-blue">Pantalla Azul (Azul Puro #0000FF) 🔵</option>
                              <option value="custom">Color Personalizado (Hexadecimal)</option>
                            </select>
                          </div>

                          {editBgType === "custom" && (
                            <div>
                              <label className="block text-[10px] font-bold text-slate uppercase">Código de Color Hex (ej: #000000):</label>
                              <input
                                type="text"
                                value={editBgColor}
                                onChange={(e) => setEditBgColor(e.target.value)}
                                className="mt-1 w-full rounded border border-ink/10 bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:border-brass"
                                placeholder="#FF00FF"
                              />
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="editStitch"
                                checked={editStitch}
                                onChange={(e) => setEditStitch(e.target.checked)}
                                className="rounded border-ink/15 text-brass focus:ring-brass"
                              />
                              <label htmlFor="editStitch" className="text-[10px] font-bold text-slate cursor-pointer select-none">
                                Modo Costura (Stitch)
                              </label>
                            </div>
                            
                            <div>
                              <label className="block text-[10px] font-bold text-slate uppercase">Silencio Cierre (pad_audio):</label>
                              <select
                                value={editPadAudio}
                                onChange={(e) => setEditPadAudio(parseFloat(e.target.value))}
                                className="mt-0.5 w-full rounded border border-ink/10 bg-white px-2 py-0.5 text-[11px] text-ink focus:outline-none focus:border-brass font-medium"
                              >
                                <option value="0">0.0s (Sin Silencio)</option>
                                <option value="0.5">0.5s (Corto)</option>
                                <option value="1.0">1.0s (Medio - Rec.)</option>
                                <option value="2.0">2.0s (Largo)</option>
                                <option value="3.0">3.0s (Extra Largo)</option>
                              </select>
                            </div>
                          </div>

                          {/* Gestos en 3 Etapas */}
                          <div className="pt-2 border-t border-ink/5 space-y-2">
                            <label className="block text-[10px] font-bold text-slate uppercase">Expresiones en 3 Etapas del Video:</label>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <span className="text-[9px] text-slate font-bold">1. Gancho</span>
                                <select
                                  value={editExpressionHook}
                                  onChange={(e) => setEditExpressionHook(e.target.value)}
                                  className="mt-0.5 w-full rounded border border-ink/10 bg-white px-1 py-0.5 text-[10px] text-ink focus:outline-none focus:border-brass font-medium"
                                >
                                  <option value="happy">Feliz 😊</option>
                                  <option value="neutral">Neutral 😐</option>
                                  <option value="serious">Serio 🤨</option>
                                  <option value="surprise">Sorpresa 😮</option>
                                </select>
                              </div>
                              <div>
                                <span className="text-[9px] text-slate font-bold">2. Desarrollo</span>
                                <select
                                  value={editExpressionBody}
                                  onChange={(e) => setEditExpressionBody(e.target.value)}
                                  className="mt-0.5 w-full rounded border border-ink/10 bg-white px-1 py-0.5 text-[10px] text-ink focus:outline-none focus:border-brass font-medium"
                                >
                                  <option value="serious">Serio 🤨</option>
                                  <option value="neutral">Neutral 😐</option>
                                  <option value="happy">Feliz 😊</option>
                                  <option value="surprise">Sorpresa 😮</option>
                                </select>
                              </div>
                              <div>
                                <span className="text-[9px] text-slate font-bold">3. CTA</span>
                                <select
                                  value={editExpressionCta}
                                  onChange={(e) => setEditExpressionCta(e.target.value)}
                                  className="mt-0.5 w-full rounded border border-ink/10 bg-white px-1 py-0.5 text-[10px] text-ink focus:outline-none focus:border-brass font-medium"
                                >
                                  <option value="happy">Feliz 😊</option>
                                  <option value="neutral">Neutral 😐</option>
                                  <option value="serious">Serio 🤨</option>
                                  <option value="surprise">Sorpresa 😮</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Panel 2: Locución SSML */}
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold text-ink border-b border-ink/5 pb-1">2. Modulación de Habla (SSML & ElevenLabs)</h4>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate uppercase">Velocidad (Rate):</label>
                              <select
                                value={editRate}
                                onChange={(e) => setEditRate(e.target.value)}
                                className="mt-1 w-full rounded border border-ink/10 bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:border-brass font-medium"
                              >
                                <option value="0.85">Lento (0.85x)</option>
                                <option value="1.0">Normal (1.0x)</option>
                                <option value="1.15">Rápido (1.15x)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate uppercase">Tono (Pitch):</label>
                              <select
                                value={editPitch}
                                onChange={(e) => setEditPitch(e.target.value)}
                                className="mt-1 w-full rounded border border-ink/10 bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:border-brass font-medium"
                              >
                                <option value="-10%">Grave (-10%)</option>
                                <option value="0%">Normal (0%)</option>
                                <option value="+10%">Agudo (+10%)</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate uppercase">Respiros / Pausas entre bloques:</label>
                            <select
                              value={editPauseDuration}
                              onChange={(e) => setEditPauseDuration(Number(e.target.value))}
                              className="mt-1 w-full rounded border border-ink/10 bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:border-brass font-medium"
                            >
                              <option value="0">Corrido (Sin Pausas)</option>
                              <option value="500">Corto (0.5 segundos)</option>
                              <option value="1000">Medio (1.0 segundo - Recomendado)</option>
                              <option value="1500">Largo (1.5 segundos)</option>
                            </select>
                          </div>

                          {/* Intensidad Emocional */}
                          <div>
                            <div className="flex justify-between items-center">
                              <label className="block text-[10px] font-bold text-slate uppercase">Intensidad de Emoción (Microsoft):</label>
                              <span className="text-[10px] font-bold text-brass">{editStyleDegree.toFixed(1)}x</span>
                            </div>
                            <input
                              type="range"
                              min="0.1"
                              max="2.0"
                              step="0.1"
                              value={editStyleDegree}
                              onChange={(e) => setEditStyleDegree(parseFloat(e.target.value))}
                              className="mt-1 w-full accent-brass cursor-pointer"
                            />
                          </div>

                          {/* ElevenLabs */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate uppercase">ElevenLabs Voice ID (Opcional - Voz Clonada):</label>
                            <input
                              type="text"
                              value={editElevenLabsVoiceId}
                              onChange={(e) => setEditElevenLabsVoiceId(e.target.value)}
                              className="mt-1 w-full rounded border border-ink/10 bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:border-brass font-mono"
                              placeholder="Ej: 21m00Tcm4TlvDq8ikWAM"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t border-ink/5 pt-4">
                  <button
                    onClick={() => setEditingScript(null)}
                    className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/[0.03]"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={savingScript || renderingId === editingScript.id}
                    onClick={async () => {
                      const ok = await handleSaveScript(editingScript.id);
                      if (ok) setEditingScript(null);
                    }}
                    className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/[0.03] disabled:opacity-50"
                  >
                    {savingScript ? "Guardando..." : "Guardar Borrador"}
                  </button>
                  <button
                    disabled={savingScript || renderingId === editingScript.id}
                    onClick={async () => {
                      const ok = await handleSaveScript(editingScript.id);
                      if (ok) {
                        await triggerRender(
                          editingScript.id, 
                          editAvatarUrl, 
                          editVoiceId, 
                          editVoiceStyle,
                          editBgType,
                          editBgColor,
                          editStitch,
                          editRate,
                          editPitch,
                          editPauseDuration,
                          editStyleDegree,
                          editPadAudio,
                          editElevenLabsVoiceId,
                          editExpressionHook,
                          editExpressionBody,
                          editExpressionCta
                        );
                      }
                    }}
                    className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper shadow-sm hover:bg-ink/90 disabled:opacity-50"
                  >
                    {renderingId === editingScript.id ? "Renderizando..." : "Confirmar y Renderizar Video 🎬"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GALERIA DE VIDEOS */}
        {activeTab === "gallery" && (
          <div>
            <h2 className="mb-6 text-lg font-bold text-ink">Videos de Avatares Renderizados</h2>
            {localScripts.filter((s) => s.status === "READY").length === 0 ? (
              <p className="text-sm text-slate">No hay videos listos todavía. Iniciá un renderizado desde los guiones.</p>
            ) : (
              <div className="grid gap-6 grid-cols-1">
                {localScripts
                  .filter((s) => s.status === "READY")
                  .map((script) => {
                    const productCategory = script.product?.category || "Instrumento";
                    const productImgUrl = getCategoryImageUrl(productCategory);

                    return (
                      <div
                        key={script.id}
                        className="flex flex-col md:flex-row overflow-hidden rounded-xl border border-ink/10 bg-paper shadow-sm"
                      >
                        {/* Panel Izquierdo: Video Player Compuesto (Mockup) */}
                        <div className="md:w-1/3 bg-slate-950 p-6 flex flex-col items-center justify-center shrink-0 border-r border-ink/5">
                          {script.avatarVideoUrl ? (
                            <CompositeVideoPlayer
                              videoUrl={script.avatarVideoUrl}
                              productImgUrl={productImgUrl}
                              hook={script.hook}
                              bodyText={script.bodyText}
                              cta={script.cta}
                              scriptId={script.id}
                              productName={script.product?.name}
                            />
                          ) : (
                            <div className="text-xs text-white/50">Falta archivo de video</div>
                          )}
                        </div>

                        {/* Panel Derecho: Información del Producto e Integración */}
                        <div className="flex-1 p-6 flex flex-col justify-between border-t md:border-t-0 md:border-l border-ink/10">
                          <div>
                            {/* Header de la Publicación */}
                            <div className="flex justify-between items-start gap-4">
                              <div>
                                <span className="rounded bg-brass/10 px-2 py-0.5 text-[10px] text-brass font-bold uppercase tracking-wider">
                                  {productCategory}
                                </span>
                                <h3 className="mt-1 text-base font-bold text-ink leading-tight">
                                  {script.product?.name || "Producto sin nombre"}
                                </h3>
                              </div>
                              <span className="text-[10px] text-slate font-medium bg-ink/5 px-2 py-1 rounded">
                                Persona: {script.persona.name}
                              </span>
                            </div>

                            {/* Ficha e Imagen del Producto */}
                            <div className="mt-4 flex gap-4 bg-slate-50 p-3 rounded-lg border border-ink/5">
                              <img 
                                src={productImgUrl} 
                                alt={script.product?.name} 
                                className="h-16 w-16 rounded-md object-cover border border-ink/10 shadow-sm shrink-0 animate-fade-in" 
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-ink">Ficha del Producto en Catálogo</p>
                                <p className="text-[11px] text-slate line-clamp-2 mt-0.5">
                                  {script.product?.description || "Sin descripción disponible."}
                                </p>
                                <div className="mt-2 flex gap-2 text-[10px] font-bold text-slate">
                                  <span>Precio: {script.product?.priceRange || "Consultar"}</span>
                                  <span>•</span>
                                  <span className={script.product?.stockStatus === "En stock" ? "text-emerald-600" : "text-amber-600"}>
                                    Stock: {script.product?.stockStatus || "Consultar"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Textos del Guión Utilizados */}
                            <div className="mt-4 border-t border-ink/5 pt-3">
                              <p className="text-xs font-bold text-ink uppercase tracking-wider">Guión y Copys de Publicación:</p>
                              <div className="mt-2 space-y-2 text-xs text-slate">
                                <div className="bg-slate-50 p-2 rounded border border-ink/5 flex justify-between items-center gap-2">
                                  <div className="min-w-0">
                                    <strong className="text-ink text-[10px] uppercase font-bold">Gancho (3s): </strong>
                                    <span className="italic block mt-0.5 truncate">&ldquo;{script.hook}&rdquo;</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(script.hook);
                                      alert("¡Gancho copiado!");
                                    }}
                                    className="text-[10px] text-brass font-bold hover:underline shrink-0"
                                  >
                                    Copiar
                                  </button>
                                </div>
                                <div className="bg-slate-50 p-2 rounded border border-ink/5 flex justify-between items-center gap-2">
                                  <div className="min-w-0">
                                    <strong className="text-ink text-[10px] uppercase font-bold">Desarrollo: </strong>
                                    <span className="italic block mt-0.5 truncate">&ldquo;{script.bodyText}&rdquo;</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(script.bodyText);
                                      alert("¡Desarrollo copiado!");
                                    }}
                                    className="text-[10px] text-brass font-bold hover:underline shrink-0"
                                  >
                                    Copiar
                                  </button>
                                </div>
                                <div className="bg-slate-50 p-2 rounded border border-ink/5 flex justify-between items-center gap-2">
                                  <div className="min-w-0">
                                    <strong className="text-ink text-[10px] uppercase font-bold">Llamado (CTA): </strong>
                                    <span className="italic block mt-0.5 truncate">&ldquo;{script.cta}&rdquo;</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(script.cta);
                                      alert("¡Llamado copiado!");
                                    }}
                                    className="text-[10px] text-brass font-bold hover:underline shrink-0"
                                  >
                                    Copiar
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Footer / Acciones */}
                          <div className="mt-6 flex gap-2 border-t border-ink/5 pt-3">
                            <a
                              href={script.avatarVideoUrl || "#"}
                              download={`avatar_video_${script.id}.mp4`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 rounded-lg bg-ink py-2 text-center text-xs font-bold text-paper hover:bg-ink/90 shadow-sm transition"
                            >
                              Descargar Video MP4
                            </a>
                            <button
                              onClick={() => {
                                const fullScriptText = `[Gancho]\n${script.hook}\n\n[Desarrollo]\n${script.bodyText}\n\n[Llamado a la acción]\n${script.cta}`;
                                navigator.clipboard.writeText(fullScriptText);
                                alert("¡Guión completo copiado al portapapeles!");
                              }}
                              className="flex-1 rounded-lg border border-ink/15 py-2 text-xs font-bold text-ink hover:bg-ink/[0.03] transition"
                            >
                              Copiar Guión Completo 📋
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL DE CARGA MANUAL DE TENDENCIA */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-paper p-6 shadow-xl border border-ink/10">
            <h3 className="text-lg font-bold text-ink">Cargar Idea o Fuente</h3>
            <p className="mt-1 text-xs text-slate">Ingresá tendencias, cloná videos virales o procesá artículos.</p>

            {/* Modal Tabs */}
            <div className="mb-4 mt-3 flex gap-2 rounded-lg bg-ink/5 p-1">
              <button
                type="button"
                onClick={() => {
                  setModalMode("TREND");
                  setManualPlatform("TWITTER");
                }}
                className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition ${
                  modalMode === "TREND"
                    ? "bg-white text-ink shadow-sm"
                    : "text-slate hover:text-ink"
                }`}
              >
                Tendencia
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalMode("VIRAL");
                  setManualPlatform("INSTAGRAM");
                }}
                className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition ${
                  modalMode === "VIRAL"
                    ? "bg-white text-ink shadow-sm"
                    : "text-slate hover:text-ink"
                }`}
              >
                🎬 Clonar Viral
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalMode("ARTICLE");
                  setManualPlatform("YOUTUBE"); // placeholder
                }}
                className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition ${
                  modalMode === "ARTICLE"
                    ? "bg-white text-ink shadow-sm"
                    : "text-slate hover:text-ink"
                }`}
              >
                📄 URL Artículo
              </button>
            </div>

            <form onSubmit={handleCreateManualTrend} className="mt-4 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate">
                  {modalMode === "TREND" && "Título / Concepto de la Tendencia:"}
                  {modalMode === "VIRAL" && "Concepto o Título del Video original:"}
                  {modalMode === "ARTICLE" && "Título o Nombre de la Fuente:"}
                </label>
                <input
                  type="text"
                  required
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder={
                    modalMode === "TREND"
                      ? "Ej: Meme de tocar batería en departamento"
                      : modalMode === "VIRAL"
                      ? "Ej: Comparativa de controlador de $100 vs $1000"
                      : "Ej: Reseña de Arturia MiniFuse en el Blog"
                  }
                  className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate">
                  {modalMode === "TREND" && "URL de Origen (opcional):"}
                  {modalMode === "VIRAL" && "URL del Video Viral (Reel, TikTok o Short) (obligatorio):"}
                  {modalMode === "ARTICLE" && "Enlace del Artículo / Review (obligatorio):"}
                </label>
                <input
                  type={modalMode === "TREND" ? "text" : "url"}
                  required={modalMode !== "TREND"}
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder={
                    modalMode === "TREND"
                      ? "https://www.instagram.com/reel/..."
                      : modalMode === "VIRAL"
                      ? "https://www.tiktok.com/@creador/video/..."
                      : "https://blog.pcmidi.com/resena-arturia-minifuse-2"
                  }
                  className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate">
                  {modalMode === "TREND" && "Descripción de la Tendencia (opcional):"}
                  {modalMode === "VIRAL" && "Dinámica y ritmo del video a clonar (obligatorio):"}
                  {modalMode === "ARTICLE" && "Contenido o Texto manual (opcional si se scrapea automáticamente):"}
                </label>
                <textarea
                  required={modalMode === "VIRAL"}
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  placeholder={
                    modalMode === "TREND"
                      ? "De qué trata el meme o el audio en tendencia..."
                      : modalMode === "VIRAL"
                      ? "Describe la secuencia o el chiste: 'El baterista se enoja con su vecino, luego muestra que los parches de malla de la batería Midiplus no hacen ruido...'"
                      : "Pegá el texto aquí si querés saltearte el scrapeo o si es una ficha técnica privada..."
                  }
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>

              {modalMode === "TREND" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate">Plataforma:</label>
                    <select
                      value={manualPlatform}
                      onChange={(e) => setManualPlatform(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none font-medium"
                    >
                      <option value="TIKTOK">TikTok</option>
                      <option value="INSTAGRAM">Instagram</option>
                      <option value="TWITTER">Twitter/X</option>
                      <option value="YOUTUBE">YouTube</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2 border-t border-ink/5 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowManualModal(false);
                    setModalMode("TREND");
                  }}
                  className="rounded-lg border border-ink/15 px-4 py-2 text-xs font-semibold text-ink hover:bg-ink/[0.03]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-paper shadow-sm hover:bg-ink/90"
                >
                  {savingManual ? "Guardando..." : "Guardar Fuente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE GENERACION DE GUION (TENDENCIA -> GUION) */}
      {showGenerateModal && selectedTrend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-paper p-6 shadow-xl border border-ink/10">
            <h3 className="text-lg font-bold text-ink">Crear Guion de Video IA</h3>
            <p className="mt-1 text-xs text-slate">
              Tendencia: <span className="font-semibold text-ink">&ldquo;{selectedTrend.title}&rdquo;</span>
            </p>

            <form onSubmit={handleGenerateScript} className="mt-4 flex flex-col gap-4">
              <div className="relative">
                <label className="block text-xs font-semibold text-slate mb-1">Producto del Catálogo:</label>
                
                {/* Trigger Button */}
                <button
                  type="button"
                  onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                  className="w-full flex items-center justify-between rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none font-medium text-left hover:bg-slate-50 transition shadow-xs"
                >
                  <span className="truncate">
                    {selectedProduct
                      ? (() => {
                          const p = products.find((prod) => prod.id === selectedProduct);
                          return p ? `[${p.brand.name}] ${p.name}` : "Seleccionar producto...";
                        })()
                      : "Seleccionar producto..."}
                  </span>
                  <span className="text-slate text-[10px] ml-2">▼</span>
                </button>

                {/* Dropdown Panel Buscador */}
                {isProductDropdownOpen && (
                  <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-ink/15 bg-paper p-2 shadow-xl animate-fade-in flex flex-col gap-2">
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="🔍 Buscar por nombre o marca..."
                      className="w-full rounded-md border border-ink/10 bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-brass font-medium"
                      autoFocus
                    />
                    
                    <div className="flex-1 overflow-y-auto max-h-44 divide-y divide-ink/5">
                      {(() => {
                        const filtered = products.filter(
                          (p) =>
                            p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                            p.brand.name.toLowerCase().includes(productSearch.toLowerCase())
                        );

                        if (filtered.length === 0) {
                          return <p className="p-3 text-center text-xs text-slate font-medium">No se encontraron productos</p>;
                        }

                        return filtered.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedProduct(p.id);
                              setIsProductDropdownOpen(false);
                              setProductSearch("");
                            }}
                            className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-brass/10 hover:text-ink transition flex flex-col ${
                              selectedProduct === p.id ? "bg-brass/5 text-brass font-bold" : "text-ink"
                            }`}
                          >
                            <span className="text-[9px] text-slate uppercase font-bold tracking-wider">{p.brand.name}</span>
                            <span className="truncate mt-0.5">{p.name}</span>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate">Arquetipo de Voz (Persona):</label>
                <select
                  required
                  value={selectedPersona}
                  onChange={(e) => setSelectedPersona(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none font-medium"
                >
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-ink/5 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowGenerateModal(false);
                    setSelectedTrend(null);
                  }}
                  className="rounded-lg border border-ink/15 px-4 py-2 text-xs font-semibold text-ink hover:bg-ink/[0.03]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-paper shadow-sm hover:bg-ink/90 animate-pulse-slow"
                >
                  {generating ? "Generando Storyboard..." : "Generar con IA 🪄"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REAL-TIME RENDERING LOADER OVERLAY */}
      {renderingOverlayScriptId && renderingOverlayStatus && showFullscreenOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-paper p-8 shadow-2xl border border-ink/10 text-center animate-fade-in">

            {(renderingOverlayStatus === "PROCESSING" || renderingOverlayStatus === "COMPOSING") && (
              <div className="flex flex-col items-center py-6">
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-ink/10 border-t-brass"></div>
                <h3 className="mt-6 text-xl font-bold text-ink">
                  {renderingOverlayStatus === "COMPOSING" 
                    ? "Componiendo Video Local... 🎬" 
                    : `Generando tu Video IA (${renderingProgress}%) 🎬`}
                </h3>
                <p className="mt-2 text-sm font-semibold text-brass animate-pulse px-4">
                  {renderingOverlayStatus === "COMPOSING"
                    ? "FFmpeg está combinando imágenes, subtítulos y audio."
                    : renderingStatusText}
                </p>
                <p className="mt-1 text-xs text-slate px-4">
                  {renderingOverlayStatus === "COMPOSING"
                    ? "Esto tardará unos segundos..."
                    : "El motor local está procesando el presentador y la voz en off."}
                </p>
                <div className="mt-6 w-full rounded-full bg-ink/5 p-1">
                  <div 
                    className="h-2 rounded-full bg-brass transition-all duration-300" 
                    style={{ width: `${renderingOverlayStatus === "COMPOSING" ? 95 : renderingProgress}%` }}
                  ></div>
                </div>
                
                <button
                  type="button"
                  onClick={() => setShowFullscreenOverlay(false)}
                  className="mt-8 rounded-lg border border-ink/15 px-5 py-2 text-xs font-bold text-slate hover:bg-ink/[0.03] transition w-full"
                >
                  Seguir en segundo plano 📥
                </button>
              </div>
            )}

            {renderingOverlayStatus === "COMPLETED" && (
              <div className="flex flex-col items-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-2xl">
                  ✓
                </div>
                <h3 className="mt-4 text-xl font-bold text-ink">¡Video Renderizado con Éxito! 🎉</h3>
                <p className="mt-1 text-sm text-slate">El presentador animado ya está listo.</p>

                {renderingOverlayVideoUrl && (
                  <div className="mt-5 w-full overflow-hidden rounded-xl border border-ink/10 bg-black aspect-[9/16] max-h-[300px]">
                    <video
                      src={renderingOverlayVideoUrl}
                      controls
                      autoPlay
                      className="h-full w-full object-contain"
                    />
                  </div>
                )}

                <div className="mt-6 flex w-full gap-2">
                  <button
                    onClick={() => {
                      setRenderingOverlayScriptId(null);
                      setRenderingOverlayStatus(null);
                    }}
                    className="flex-1 rounded-lg bg-ink py-2.5 text-xs font-semibold text-paper hover:bg-ink/90"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            )}

            {renderingOverlayStatus === "FAILED" && (
              <div className="flex flex-col items-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-800 text-2xl font-bold">
                  !
                </div>
                <h3 className="mt-4 text-xl font-bold text-ink">Fallo en la Renderización</h3>
                <p className="mt-2 text-sm text-red-600 px-4 line-clamp-4 bg-red-50 p-3 rounded-lg border border-red-100 text-xs font-mono text-left w-full overflow-auto">
                  {renderingOverlayError || "Ocurrió un error desconocido con el renderizador local."}
                </p>

                <div className="mt-6 flex w-full gap-2">
                  <button
                    onClick={() => {
                      setRenderingOverlayScriptId(null);
                      setRenderingOverlayStatus(null);
                    }}
                    className="flex-1 rounded-lg border border-ink/15 py-2.5 text-xs font-semibold text-ink hover:bg-ink/[0.03]"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={async () => {
                      if (renderingOverlayScriptId) {
                        await triggerRender(
                          renderingOverlayScriptId, 
                          editAvatarUrl, 
                          editVoiceId, 
                          editVoiceStyle,
                          editBgType,
                          editBgColor,
                          editStitch,
                          editRate,
                          editPitch,
                          editPauseDuration,
                          editStyleDegree,
                          editPadAudio,
                          editElevenLabsVoiceId,
                          editExpressionHook,
                          editExpressionBody,
                          editExpressionCta
                        );
                      }
                    }}
                    className="flex-1 rounded-lg bg-ink py-2.5 text-xs font-semibold text-paper hover:bg-ink/90"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* FLOATING STATUS WIDGET (SEGUNDO PLANO) */}
      {renderingOverlayScriptId && renderingOverlayStatus === "PROCESSING" && !showFullscreenOverlay && (
        <div 
          onClick={() => setShowFullscreenOverlay(true)}
          className="fixed bottom-6 right-6 z-40 flex w-80 cursor-pointer items-center gap-4 rounded-xl border border-ink/10 bg-paper p-4 shadow-2xl hover:border-brass transition-all duration-300 animate-slide-up"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brass border-t-transparent"></div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center">
              <p className="text-xs font-bold text-ink truncate">Generando Video ({renderingProgress}%)</p>
              <span className="text-[10px] font-bold text-brass">{renderingProgress}%</span>
            </div>
            <p className="text-[10px] text-slate truncate mt-0.5">{renderingStatusText}</p>
            <div className="mt-2 w-full rounded-full bg-ink/5 h-1">
              <div className="h-full rounded-full bg-brass transition-all duration-300" style={{ width: `${renderingProgress}%` }}></div>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setRenderingOverlayScriptId(null);
              setRenderingOverlayStatus(null);
            }}
            className="text-slate hover:text-ink text-xs font-bold px-1"
            title="Cancelar render"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ==========================================
// COMPONENTE DE VIDEO COMPUESTO Y GRABACIÓN (EXPORTER)
// ==========================================
type CompositeVideoPlayerProps = {
  videoUrl: string;
  productImgUrl: string;
  hook: string;
  bodyText: string;
  cta: string;
  scriptId: string;
  productName?: string;
};

function CompositeVideoPlayer({
  videoUrl,
  productImgUrl,
  hook,
  bodyText,
  cta,
  scriptId,
  productName,
}: CompositeVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Determinar qué subtítulo mostrar según el progreso
  const getActiveSubtitle = () => {
    if (!duration) return hook;
    const ratio = currentTime / duration;
    if (ratio < 0.25) return hook;
    if (ratio < 0.8) return bodyText;
    return cta;
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 15);
    }
  };

  const handleExport = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      setExportProgress(0);
      
      // Detener y rebobinar video para empezar grabación limpia
      video.pause();
      video.currentTime = 0;
      
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
      });

      // Canvas de alta definición en relación 9:16 (720x1280)
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo obtener el contexto Canvas");

      // Cargar la imagen del producto
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = productImgUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });

      // Configurar AudioContext para capturar el sonido del video sin ruidos
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      const source = audioCtx.createMediaElementSource(video);
      source.connect(dest);
      source.connect(audioCtx.destination);

      // Iniciar captura
      const canvasStream = canvas.captureStream(25); // 25 fps
      const compositeStream = new MediaStream([
        canvasStream.getVideoTracks()[0],
        dest.stream.getAudioTracks()[0]
      ]);

      const mediaRecorder = new MediaRecorder(compositeStream, {
        mimeType: "video/webm;codecs=vp9",
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `anuncio_${productName?.toLowerCase().replace(/\s+/g, "_") || "video"}.webm`;
        a.click();
        
        audioCtx.close();
        setExportProgress(null);
      };

      mediaRecorder.start();
      video.play();
      setIsPlaying(true);

      const drawLoop = () => {
        if (video.paused || video.ended) {
          if (video.ended) {
            mediaRecorder.stop();
          }
          return;
        }

        const t = video.currentTime;
        const dur = video.duration || 15;
        const progressPct = Math.round((t / dur) * 100);
        setExportProgress(Math.min(99, progressPct));

        // 1. Fondo
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Imagen del producto (Mitad Superior) con zoom Ken Burns lento
        const scale = 1.0 + 0.12 * (t / dur);
        const xOffset = -30 * (t / dur);
        const imgW = canvas.width * scale;
        const imgH = 700 * scale;
        const imgX = (canvas.width - imgW) / 2 + xOffset;
        const imgY = (700 - imgH) / 2;
        ctx.drawImage(img, imgX, imgY, imgW, imgH);

        // Línea divisora dorada
        ctx.fillStyle = "#fd7e14";
        ctx.fillRect(0, 698, canvas.width, 4);

        // 3. Video del Avatar (Mitad Inferior)
        const vRatio = video.videoWidth / (video.videoHeight || 1);
        const targetH = 580;
        const targetW = targetH * vRatio;
        const targetX = (canvas.width - targetW) / 2;
        const targetY = 700;
        ctx.drawImage(video, targetX, targetY, targetW, targetH);

        // 4. Marca de Agua / Cabecera
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(20, 20, 240, 44);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px Inter, sans-serif";
        ctx.fillText("PC MIDI CENTER", 40, 48);

        // 5. Subtítulo dinámico
        const currentRatio = t / dur;
        let subtitleText = hook;
        if (currentRatio >= 0.25 && currentRatio < 0.8) {
          subtitleText = bodyText;
        } else if (currentRatio >= 0.8) {
          subtitleText = cta;
        }

        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        ctx.fillRect(40, 1080, canvas.width - 80, 140);
        ctx.strokeStyle = "#fd7e14";
        ctx.lineWidth = 2;
        ctx.strokeRect(40, 1080, canvas.width - 80, 140);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px Inter, sans-serif";
        ctx.textAlign = "center";
        
        // Formatear texto en líneas
        const words = subtitleText.split(" ");
        let line = "";
        const lines = [];
        const maxWidth = canvas.width - 120;
        
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + " ";
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
            lines.push(line);
            line = words[n] + " ";
          } else {
            line = testLine;
          }
        }
        lines.push(line);

        lines.slice(0, 3).forEach((l, idx) => {
          ctx.fillText(l.trim(), canvas.width / 2, 1125 + idx * 35);
        });

        ctx.textAlign = "left";
        requestAnimationFrame(drawLoop);
      };

      requestAnimationFrame(drawLoop);

    } catch (e: any) {
      console.error(e);
      alert("Error al componer el video: " + e.message);
      setExportProgress(null);
    }
  };

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Teléfono Mockup */}
      <div className="relative w-full max-w-[270px] aspect-[9/16] overflow-hidden rounded-[2.5rem] border-[8px] border-slate-900 bg-slate-950 shadow-2xl flex flex-col">
        {/* Superior: Slideshow / Producto */}
        <div className="relative h-[55%] w-full overflow-hidden border-b-2 border-brass bg-slate-900 select-none">
          <img
            src={productImgUrl}
            alt="Producto"
            className={`h-full w-full object-cover transition-transform duration-[15s] ease-out ${
              isPlaying ? "scale-110 translate-x-1" : "scale-100"
            }`}
          />
          <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-xs rounded px-2 py-0.5 text-[8px] font-bold text-white uppercase tracking-wider">
            PC MIDI Center
          </div>
        </div>

        {/* Inferior: Avatar Video */}
        <div className="relative h-[45%] w-full bg-slate-950 flex items-center justify-center">
          <video
            ref={videoRef}
            src={videoUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            controls
            className="h-full w-full object-cover"
          />

          {/* Subtítulos */}
          <div className="absolute bottom-16 left-3 right-3 bg-black/60 border border-brass/30 backdrop-blur-xs rounded-lg p-2 text-center select-none">
            <p className="text-[8px] font-bold text-brass uppercase tracking-wider">Subtítulos Sincronizados</p>
            <p className="text-[10px] text-white font-medium mt-0.5 line-clamp-2 leading-tight">
              {getActiveSubtitle()}
            </p>
          </div>
        </div>
      </div>

      {/* Botón */}
      <div className="mt-4 w-full max-w-[270px]">
        {exportProgress !== null ? (
          <div className="w-full bg-slate-100 border border-brass/20 rounded-xl p-3 text-center">
            <p className="text-xs font-bold text-ink">Componiendo Video 🎬</p>
            <div className="mt-2 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-brass h-full transition-all duration-150"
                style={{ width: `${exportProgress}%` }}
              ></div>
            </div>
            <p className="text-[9px] text-slate font-bold mt-1">{exportProgress}% grabado...</p>
          </div>
        ) : (
          <button
            onClick={handleExport}
            className="w-full rounded-xl bg-brass px-3 py-2 text-xs font-bold text-ink hover:bg-brass/90 shadow-md flex items-center justify-center gap-1.5 transition"
          >
            <span>🎬</span> Exportar Video Reels/TikTok
          </button>
        )}
      </div>
    </div>
  );
}
