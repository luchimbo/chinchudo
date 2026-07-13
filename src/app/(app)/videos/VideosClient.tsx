"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Client, Persona, Product, Trend, VideoScript } from "@prisma/client";

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

type Tab = "trends" | "scripts";

const PLATFORM_LABELS: Record<string, string> = {
  GOOGLE_TRENDS: "Google Trends AR",
  TIKTOK: "TikTok",
  TIKTOK_CREATIVE_CENTER: "TikTok Creative Center",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube Shorts",
  TWITTER: "X/Twitter",
  REDDIT: "Reddit",
  VIRAL_MARKETING: "Viral marketing",
  VIRAL_CLONE: "Estructura viral",
  URL_ARTICLE: "Articulo/URL",
};

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function visualText(value: string) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    return parsed.text || value;
  } catch {
    return value;
  }
}

function scriptToClipboardText(script: ScopedScript) {
  return [
    `HOOK: ${script.hook}`,
    "",
    `CUERPO: ${script.bodyText}`,
    "",
    `CTA: ${script.cta}`,
    "",
    `VISUALES: ${visualText(script.visualCues)}`,
    "",
    `AUDIO/ESTILO: ${script.audioPrompt}`,
  ].join("\n");
}

export default function VideosClient({
  activeClient,
  clients,
  trends,
  products,
  personas,
  scripts,
}: VideosClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("trends");
  const [localTrends, setLocalTrends] = useState<Trend[]>(trends);
  const [localScripts, setLocalScripts] = useState<ScopedScript[]>(scripts);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedTrend, setSelectedTrend] = useState<Trend | null>(null);
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.id || "");
  const [selectedPersona, setSelectedPersona] = useState(personas[0]?.id || "");
  const [productSearch, setProductSearch] = useState("");
  const [generating, setGenerating] = useState(false);
  const [manualMode, setManualMode] = useState<"TREND" | "VIRAL" | "ARTICLE">("TREND");
  const [manualTitle, setManualTitle] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualPlatform, setManualPlatform] = useState("TIKTOK");
  const [savingManual, setSavingManual] = useState(false);
  const [editingScript, setEditingScript] = useState<ScopedScript | null>(null);
  const [editHook, setEditHook] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCta, setEditCta] = useState("");
  const [editVisuals, setEditVisuals] = useState("");
  const [editAudio, setEditAudio] = useState("");
  const [savingScript, setSavingScript] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setLocalTrends(trends);
    setLocalScripts(scripts);
    setSelectedProduct(products[0]?.id || "");
    setSelectedPersona(personas[0]?.id || "");
  }, [trends, scripts, products, personas]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) =>
      `${product.name} ${product.brand.name} ${product.category}`.toLowerCase().includes(q),
    );
  }, [productSearch, products]);

  const handleClientChange = (slug: string) => {
    router.push(`/videos?client=${slug}`);
  };

  const openGenerate = (trend: Trend) => {
    setSelectedTrend(trend);
    setSelectedProduct(products[0]?.id || "");
    setSelectedPersona(personas[0]?.id || "");
    setProductSearch("");
    setShowGenerateModal(true);
  };

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
      if (!data.success) throw new Error(data.error || "No se pudo generar el guion.");
      router.refresh();
      setShowGenerateModal(false);
      setSelectedTrend(null);
      setActiveTab("scripts");
    } catch (err: any) {
      alert(err.message || "Error de conexion.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateManualTrend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;

    const platform =
      manualMode === "VIRAL" ? "VIRAL_CLONE" : manualMode === "ARTICLE" ? "URL_ARTICLE" : manualPlatform;

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
          platform,
          clientId: activeClient.id,
          metadata: {
            manual: true,
            editorialMode: manualMode,
          },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "No se pudo guardar la tendencia.");
      router.refresh();
      setShowManualModal(false);
      setManualMode("TREND");
      setManualTitle("");
      setManualDesc("");
      setManualUrl("");
      setManualPlatform("TIKTOK");
    } catch (err: any) {
      alert(err.message || "Error de conexion.");
    } finally {
      setSavingManual(false);
    }
  };

  const openEditor = (script: ScopedScript) => {
    setEditingScript(script);
    setEditHook(script.hook);
    setEditBody(script.bodyText);
    setEditCta(script.cta);
    setEditVisuals(visualText(script.visualCues));
    setEditAudio(script.audioPrompt || "");
  };

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
          visualCues: editVisuals,
          audioPrompt: editAudio,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "No se pudo guardar el guion.");
      setLocalScripts((prev) =>
        prev.map((script) =>
          script.id === scriptId
            ? { ...script, hook: editHook, bodyText: editBody, cta: editCta, visualCues: editVisuals, audioPrompt: editAudio }
            : script,
        ),
      );
      setEditingScript(null);
    } catch (err: any) {
      alert(err.message || "Error de conexion.");
    } finally {
      setSavingScript(false);
    }
  };

  const copyScript = async (script: ScopedScript) => {
    await navigator.clipboard.writeText(scriptToClipboardText(script));
    setCopiedId(script.id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6">
        <section className="border-b border-ink/10 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brass">Radar editorial</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-ink">Tendencias y Guiones</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">
                Ideas de TikTok, Instagram, Shorts y tendencias generales listas para convertir en guiones editables.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={activeClient.slug}
                onChange={(e) => handleClientChange(e.target.value)}
                className="h-10 rounded-md border border-ink/15 bg-white px-3 text-sm font-semibold text-ink"
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.slug}>
                    {client.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowManualModal(true)}
                className="h-10 rounded-md bg-ink px-4 text-sm font-bold text-paper hover:bg-ink/90"
              >
                Cargar tendencia
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric label="Tendencias guardadas" value={localTrends.length} />
            <Metric label="Guiones creados" value={localScripts.length} />
            <Metric label="Fuentes activas" value={new Set(localTrends.map((trend) => trend.platform)).size} />
          </div>
        </section>

        <div className="flex gap-2 border-b border-ink/10">
          <TabButton active={activeTab === "trends"} onClick={() => setActiveTab("trends")}>
            Tendencias
          </TabButton>
          <TabButton active={activeTab === "scripts"} onClick={() => setActiveTab("scripts")}>
            Guiones
          </TabButton>
        </div>

        {activeTab === "trends" ? (
          <section className="grid gap-3">
            {localTrends.length === 0 ? (
              <EmptyState title="Sin tendencias todavia" body="Carga una idea manual o corre el radar para alimentar la guionera." />
            ) : (
              localTrends.map((trend) => (
                <article key={trend.id} className="rounded-md border border-ink/10 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-sm bg-brass/15 px-2 py-1 text-[11px] font-black uppercase text-brass">
                          {PLATFORM_LABELS[trend.platform] || trend.platform}
                        </span>
                        <span className="text-xs font-semibold text-slate">{formatDate(trend.createdAt)}</span>
                        {trend.queryUsed && <span className="text-xs text-slate">Busqueda: {trend.queryUsed}</span>}
                      </div>
                      <h2 className="mt-2 text-lg font-black text-ink">{trend.title}</h2>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate">{trend.description}</p>
                      {trend.sourceUrl && (
                        <a
                          href={trend.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs font-bold text-brass hover:underline"
                        >
                          Ver fuente
                        </a>
                      )}
                    </div>
                    <button
                      onClick={() => openGenerate(trend)}
                      disabled={products.length === 0 || personas.length === 0}
                      className="h-10 shrink-0 rounded-md bg-ink px-4 text-sm font-bold text-paper hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Crear guion
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
        ) : (
          <section className="grid gap-3">
            {localScripts.length === 0 ? (
              <EmptyState title="Todavia no hay guiones" body="Elegí una tendencia y generá un borrador con producto y persona." />
            ) : (
              localScripts.map((script) => (
                <article key={script.id} className="rounded-md border border-ink/10 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate">
                        <span>{script.trend?.title || "Sin tendencia asociada"}</span>
                        <span>/</span>
                        <span>{script.product?.name || "Sin producto"}</span>
                        <span>/</span>
                        <span>{script.persona.name}</span>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <ScriptBlock label="Hook" text={script.hook} />
                        <ScriptBlock label="Cuerpo" text={script.bodyText} />
                        <ScriptBlock label="CTA" text={script.cta} />
                      </div>
                      {(script.visualCues || script.audioPrompt) && (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <ScriptBlock label="Visuales" text={visualText(script.visualCues)} />
                          <ScriptBlock label="Audio/estilo" text={script.audioPrompt} />
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2 lg:flex-col">
                      <button
                        onClick={() => openEditor(script)}
                        className="h-9 rounded-md border border-ink/15 px-3 text-xs font-bold text-ink hover:bg-ink/[0.03]"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => copyScript(script)}
                        className="h-9 rounded-md bg-brass px-3 text-xs font-bold text-ink hover:bg-brass/90"
                      >
                        {copiedId === script.id ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>
        )}
      </main>

      {showManualModal && (
        <Modal title="Cargar tendencia" onClose={() => setShowManualModal(false)}>
          <form onSubmit={handleCreateManualTrend} className="grid gap-4">
            <div className="grid min-w-0 grid-cols-3 gap-2">
              {(["TREND", "VIRAL", "ARTICLE"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setManualMode(mode)}
                  className={`min-w-0 rounded-md border px-3 py-2 text-xs font-black ${
                    manualMode === mode ? "border-ink bg-ink text-paper" : "border-ink/15 text-ink"
                  }`}
                >
                  {mode === "TREND" ? "Tendencia" : mode === "VIRAL" ? "Viral" : "URL"}
                </button>
              ))}
            </div>
            {manualMode === "TREND" && (
              <label className="grid min-w-0 gap-1 text-xs font-bold text-slate">
                Fuente
                <select
                  value={manualPlatform}
                  onChange={(e) => setManualPlatform(e.target.value)}
                  className="h-10 w-full min-w-0 rounded-md border border-ink/15 bg-white px-3 text-sm text-ink"
                >
                  <option value="TIKTOK">TikTok</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="YOUTUBE">YouTube Shorts</option>
                  <option value="GOOGLE_TRENDS">Google Trends</option>
                  <option value="TWITTER">X/Twitter</option>
                  <option value="REDDIT">Reddit</option>
                </select>
              </label>
            )}
            <label className="grid min-w-0 gap-1 text-xs font-bold text-slate">
              Titulo
              <input
                required
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                className="h-10 w-full min-w-0 rounded-md border border-ink/15 px-3 text-sm text-ink"
                placeholder="Ej: Audio viral para mostrar setups chicos"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-bold text-slate">
              Descripcion o dinamica
              <textarea
                value={manualDesc}
                onChange={(e) => setManualDesc(e.target.value)}
                className="min-h-28 w-full min-w-0 rounded-md border border-ink/15 px-3 py-2 text-sm text-ink"
                placeholder="Que pasa en el video, que formato usa, por que puede servir..."
              />
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-bold text-slate">
              URL fuente
              <input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                className="h-10 w-full min-w-0 rounded-md border border-ink/15 px-3 text-sm text-ink"
                placeholder="https://..."
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-ink/10 pt-4">
              <button type="button" onClick={() => setShowManualModal(false)} className="h-10 rounded-md border border-ink/15 px-4 text-sm font-bold">
                Cancelar
              </button>
              <button disabled={savingManual} className="h-10 rounded-md bg-ink px-4 text-sm font-bold text-paper disabled:opacity-50">
                {savingManual ? "Guardando..." : "Guardar tendencia"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showGenerateModal && selectedTrend && (
        <Modal title="Crear guion desde tendencia" onClose={() => setShowGenerateModal(false)}>
          <form onSubmit={handleGenerateScript} className="grid gap-4">
            <div className="min-w-0 rounded-md bg-ink/[0.03] p-3">
              <p className="text-xs font-black uppercase text-brass">Tendencia base</p>
              <p className="mt-1 break-words text-sm font-bold text-ink">{selectedTrend.title}</p>
            </div>
            <label className="grid min-w-0 gap-1 text-xs font-bold text-slate">
              Buscar producto
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="h-10 w-full min-w-0 rounded-md border border-ink/15 px-3 text-sm text-ink"
                placeholder="Nombre, marca o categoria"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-bold text-slate">
              Producto
              <select
                required
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="h-10 w-full min-w-0 rounded-md border border-ink/15 bg-white px-3 text-sm text-ink"
              >
                {filteredProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} - {product.brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-xs font-bold text-slate">
              Persona
              <select
                required
                value={selectedPersona}
                onChange={(e) => setSelectedPersona(e.target.value)}
                className="h-10 w-full min-w-0 rounded-md border border-ink/15 bg-white px-3 text-sm text-ink"
              >
                {personas.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 border-t border-ink/10 pt-4">
              <button type="button" onClick={() => setShowGenerateModal(false)} className="h-10 rounded-md border border-ink/15 px-4 text-sm font-bold">
                Cancelar
              </button>
              <button disabled={generating} className="h-10 rounded-md bg-ink px-4 text-sm font-bold text-paper disabled:opacity-50">
                {generating ? "Generando..." : "Generar guion"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingScript && (
        <Modal title="Editar guion" onClose={() => setEditingScript(null)} wide>
          <div className="grid gap-4">
            <EditorField label="Hook" value={editHook} onChange={setEditHook} rows={3} />
            <EditorField label="Cuerpo" value={editBody} onChange={setEditBody} rows={7} />
            <EditorField label="CTA" value={editCta} onChange={setEditCta} rows={3} />
            <EditorField label="Visuales sugeridos" value={editVisuals} onChange={setEditVisuals} rows={5} />
            <EditorField label="Audio/estilo sugerido" value={editAudio} onChange={setEditAudio} rows={3} />
            <div className="flex justify-end gap-2 border-t border-ink/10 pt-4">
              <button type="button" onClick={() => setEditingScript(null)} className="h-10 rounded-md border border-ink/15 px-4 text-sm font-bold">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSaveScript(editingScript.id)}
                disabled={savingScript}
                className="h-10 rounded-md bg-ink px-4 text-sm font-bold text-paper disabled:opacity-50"
              >
                {savingScript ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-ink/10 bg-white p-4">
      <p className="text-2xl font-black text-ink">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate">{label}</p>
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-1 pb-3 text-sm font-black ${
        active ? "border-brass text-ink" : "border-transparent text-slate hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ScriptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-ink/10 bg-paper/60 p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-brass">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{text || "Sin contenido."}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-ink/20 bg-white p-10 text-center">
      <h2 className="text-lg font-black text-ink">{title}</h2>
      <p className="mt-2 text-sm text-slate">{body}</p>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4">
      <div className={`max-h-[92vh] w-full overflow-hidden rounded-md bg-paper shadow-2xl flex flex-col ${wide ? "max-w-3xl" : "max-w-2xl"}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-ink/10 p-5">
          <h2 className="min-w-0 pr-3 text-lg font-black text-ink">{title}</h2>
          <button onClick={onClose} className="h-8 w-8 shrink-0 rounded-md border border-ink/15 text-sm font-black text-ink">
            x
          </button>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function EditorField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  return (
    <label className="grid gap-1 text-xs font-bold text-slate">
      {label}
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-ink/15 px-3 py-2 text-sm leading-6 text-ink"
      />
    </label>
  );
}
