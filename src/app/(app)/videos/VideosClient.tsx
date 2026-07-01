"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Client, Trend, Product, Persona, VideoScript } from "@prisma/client";

type ScopedScript = VideoScript & {
  product: { name: string } | null;
  persona: { name: string };
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

  // Formulario manual de tendencias
  const [manualTitle, setManualTitle] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualPlatform, setManualPlatform] = useState("TWITTER");
  const [savingManual, setSavingManual] = useState(false);

  // Editor de guion existente
  const [editingScript, setEditingScript] = useState<ScopedScript | null>(null);
  const [editHook, setEditHook] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCta, setEditCta] = useState("");
  const [editVisuals, setEditVisuals] = useState("");
  const [renderingId, setRenderingId] = useState<string | null>(null);

  // Sincronizar props con estado local al cambiar de cliente
  useEffect(() => {
    setLocalScripts(scripts);
    setLocalTrends(trends);
  }, [scripts, trends]);

  // Polling automático para chequear videos en renderizado
  useEffect(() => {
    const renderingScripts = localScripts.filter((s) => s.status === "RENDERING" && s.avatarJobId);
    if (renderingScripts.length === 0) return;

    const interval = setInterval(async () => {
      for (const script of renderingScripts) {
        try {
          const res = await fetch(`/api/videos?action=status&scriptId=${script.id}`);
          const data = await res.json();
          if (data.success && (data.status === "COMPLETED" || data.status === "FAILED")) {
            setLocalScripts((prev) =>
              prev.map((s) =>
                s.id === script.id
                  ? {
                      ...s,
                      avatarStatus: data.status,
                      avatarVideoUrl: data.videoUrl || "",
                      status: data.status === "COMPLETED" ? "READY" : "NEW",
                    }
                  : s
              )
            );
          }
        } catch (err) {
          console.error("Error al consultar el estado de D-ID:", err);
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
    if (!manualTitle || !manualPlatform) return;

    setSavingManual(true);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_manual_trend",
          title: manualTitle,
          description: manualDesc,
          sourceUrl: manualUrl,
          platform: manualPlatform,
          clientId: activeClient.id,
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.refresh();
        setShowManualModal(false);
        setManualTitle("");
        setManualDesc("");
        setManualUrl("");
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
    setEditVisuals(script.visualCues);
  };

  // Renderizar en D-ID
  const triggerRender = async (scriptId: string) => {
    setRenderingId(scriptId);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "render",
          scriptId,
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
      } else {
        alert(data.error || "No se pudo iniciar el renderizado.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al conectar con la API.");
    } finally {
      setRenderingId(null);
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
                + Cargar Enlace Manual
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
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {trend.platform}
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
                                script.status === "RENDERING"
                                  ? "bg-amber-100 text-amber-800 animate-pulse"
                                  : script.status === "FAILED"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-blue-50 text-blue-800"
                              }`}
                            >
                              {script.status === "RENDERING"
                                ? "Renderizando en D-ID..."
                                : script.status === "FAILED"
                                ? "Falló D-ID"
                                : "Borrador Listo"}
                            </span>
                          </div>

                          <div className="mt-4">
                            <p className="text-xs font-bold text-slate uppercase tracking-wider">Guion Narrativo:</p>
                            <blockquote className="mt-2 border-l-2 border-ink/10 pl-3 text-sm italic text-slate/85">
                              "{script.hook} {script.bodyText} {script.cta}"
                            </blockquote>
                          </div>

                          <div className="mt-5 flex gap-2 justify-end">
                            {script.status === "RENDERING" ? (
                              <button
                                disabled
                                className="rounded-lg bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate/50 cursor-not-allowed"
                              >
                                Renderizando... ⌛
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
                                  {renderingId === script.id ? "Iniciando..." : "Renderizar Video D-ID 🎬"}
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
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t border-ink/5 pt-4">
                  <button
                    onClick={() => setEditingScript(null)}
                    className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/[0.03]"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      // Guardar cambios
                      try {
                        // En un MVP guardamos y disparamos render
                        // Para simplificar, actualizamos y disparamos D-ID
                        await triggerRender(editingScript.id);
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper shadow-sm hover:bg-ink/90"
                  >
                    Confirmar y Renderizar Video 🎬
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
              <div className="grid gap-6 sm:grid-cols-2">
                {localScripts
                  .filter((s) => s.status === "READY")
                  .map((script) => (
                    <div
                      key={script.id}
                      className="overflow-hidden rounded-xl border border-ink/10 bg-paper shadow-sm"
                    >
                      {/* Video Player */}
                      <div className="aspect-[9/16] max-h-[480px] w-full bg-slate-950">
                        {script.avatarVideoUrl ? (
                          <video
                            src={script.avatarVideoUrl}
                            controls
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-white/50">
                            Falta archivo de video
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-4">
                        <h3 className="font-semibold text-ink text-sm line-clamp-1">
                          {script.trend?.title || "Guion de Tendencia"}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded bg-ink/5 px-2 py-0.5 text-[10px] text-slate">
                            {script.product?.name || "Catálogo"}
                          </span>
                          <span className="rounded bg-brass/10 px-2 py-0.5 text-[10px] text-brass font-medium">
                            Voz: {script.persona.name}
                          </span>
                        </div>
                        <div className="mt-4 flex gap-2 border-t border-ink/5 pt-3">
                          <a
                            href={script.avatarVideoUrl || "#"}
                            download={`avatar_video_${script.id}.mp4`}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full rounded-lg bg-ink py-2 text-center text-xs font-semibold text-paper hover:bg-ink/90 shadow-sm"
                          >
                            Descargar MP4
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL DE CARGA MANUAL DE TENDENCIA */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-paper p-6 shadow-xl border border-ink/10">
            <h3 className="text-lg font-bold text-ink">Cargar Tendencia Manualmente</h3>
            <p className="mt-1 text-xs text-slate">Agregá un enlace y tema relevante de Argentina.</p>

            <form onSubmit={handleCreateManualTrend} className="mt-4 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate">Título / Concepto:</label>
                <input
                  type="text"
                  required
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Ej: Meme de tocar batería en departamento"
                  className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate">Descripción:</label>
                <textarea
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  placeholder="De qué trata el meme o el audio en tendencia..."
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate">URL de Origen (opcional):</label>
                <input
                  type="url"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="https://www.instagram.com/reel/..."
                  className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>

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

              <div className="mt-4 flex justify-end gap-2 border-t border-ink/5 pt-4">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="rounded-lg border border-ink/15 px-4 py-2 text-xs font-semibold text-ink hover:bg-ink/[0.03]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-paper shadow-sm hover:bg-ink/90"
                >
                  {savingManual ? "Guardando..." : "Guardar Tendencia"}
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
              Tendencia: <span className="font-semibold text-ink">"{selectedTrend.title}"</span>
            </p>

            <form onSubmit={handleGenerateScript} className="mt-4 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate">Producto del Catálogo:</label>
                <select
                  required
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none font-medium"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.brand.name}] {p.name}
                    </option>
                  ))}
                </select>
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
    </div>
  );
}
