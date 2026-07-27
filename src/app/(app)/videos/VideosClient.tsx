"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Client, ContentIdea, ContentIdeaStatus, ContentIntent, Persona, Product, Trend, VideoScript } from "@prisma/client";
import type { EditorialAngle } from "@/lib/content-idea-generator";

type Idea = ContentIdea & { product: Product & { brand: { name: string } }; trend: { title: string } | null; videoScripts: { id: string }[] };
type Script = VideoScript & { product: Product | null; persona: Persona; trend: { title: string } | null; contentIdea: { hook: string } | null };
type Props = { activeClient: Client; clients: Client[]; trends: Trend[]; products: (Product & { brand: { name: string } })[]; personas: Persona[]; scripts: Script[]; ideas: Idea[] };
type Tab = "create" | "lab" | "production";

const INTENTS: { value: ContentIntent; label: string; hint: string }[] = [
  { value: "SALE", label: "Vender", hint: "Mostrar valor con claridad" },
  { value: "EDUCATION", label: "Enseñar", hint: "Resolver una duda real" },
  { value: "USE_CASE", label: "Mostrar uso", hint: "Llevarlo a una escena concreta" },
  { value: "ENTERTAINMENT", label: "Entretener", hint: "Humor o formato de comunidad" },
];
const STATUS: Record<ContentIdeaStatus, string> = { REVIEW: "Por revisar", APPROVED: "Idea aprobada", SCRIPT_READY: "Guion listo", READY_TO_RECORD: "Listo para grabar", RECORDED: "Grabado", PUBLISHED: "Publicado", DISCARDED: "Descartado" };
const PLATFORM: Record<string, string> = { TIKTOK: "TikTok", INSTAGRAM: "Instagram", YOUTUBE: "YouTube", GOOGLE_TRENDS: "Google", TIKTOK_CREATIVE_CENTER: "TikTok Radar", VIRAL_MARKETING: "Formato viral", VIRAL_CLONE: "Estructura viral", URL_ARTICLE: "URL" };

function score(score: number) { return "●".repeat(Math.max(0, score)) + "○".repeat(Math.max(0, 5 - score)); }

export default function VideosClient({ activeClient, clients, trends, products, personas, scripts, ideas }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [intent, setIntent] = useState<ContentIntent>("SALE");
  const [angles, setAngles] = useState<EditorialAngle[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [personaId, setPersonaId] = useState(personas[0]?.id || "");
  const [labFilter, setLabFilter] = useState("ALL");
  const [saving, setSaving] = useState(false);

  const currentProduct = products.find((p) => p.id === productId);
  const lab = useMemo(() => trends.filter((trend) => labFilter === "ALL" || (labFilter === "READY" ? trend.analysisStatus === "ANALYZED" : trend.analysisStatus === labFilter)), [trends, labFilter]);

  async function post(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, clientId: activeClient.id, ...payload }) });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "No se pudo completar la acción.");
    return data;
  }
  async function generateAngles() {
    if (!productId) return;
    setLoading(true);
    try { setAngles((await post("generate_angles", { productId, intent })).angles); } catch (error: any) { alert(error.message); } finally { setLoading(false); }
  }
  async function approveAngle(angle: EditorialAngle) {
    setSaving(true);
    try { await post("create_idea", { productId, intent, ...angle }); router.refresh(); setAngles([]); setTab("production"); } catch (error: any) { alert(error.message); } finally { setSaving(false); }
  }
  async function generateScript() {
    if (!selectedIdea || !personaId) return;
    setSaving(true);
    try { await post("generate_script_from_idea", { contentIdeaId: selectedIdea.id, personaId }); setSelectedIdea(null); router.refresh(); } catch (error: any) { alert(error.message); } finally { setSaving(false); }
  }
  async function updateStatus(ideaId: string, status: ContentIdeaStatus) {
    try { await post("update_idea_status", { ideaId, status }); router.refresh(); } catch (error: any) { alert(error.message); }
  }
  async function analyze(trendId: string) { setSaving(true); try { await post("analyze_trend", { trendId }); router.refresh(); } catch (error: any) { alert(error.message); } finally { setSaving(false); } }
  async function createFromTrend(trend: Trend) {
    const suggested = products.find((product) => product.id === trend.suggestedProductId) || currentProduct;
    if (!suggested) return;
    try { await post("create_idea", { productId: suggested.id, trendId: trend.id, intent: "USE_CASE", format: trend.viralFormula || "Adaptación editorial", hook: trend.suggestedAngle || trend.title, rationale: trend.viralFormula || trend.description, visualDirection: trend.visualDirection, viabilityScore: trend.viabilityScore || 3 }); router.refresh(); setTab("production"); } catch (error: any) { alert(error.message); }
  }

  return <div className="min-h-screen bg-paper text-ink"><main className="mx-auto w-full max-w-7xl px-5 py-7">
    <header className="relative overflow-hidden rounded-2xl border border-ink/10 bg-ink px-6 py-7 text-paper shadow-panel">
      <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full bg-brass/30 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[.22em] text-brass">Estudio editorial</p><h1 className="mt-2 font-display text-4xl font-bold">Ideas para grabar</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-paper/75">Elegí qué producto mover. Después elegí la idea que mejor se puede filmar.</p></div><select value={activeClient.slug} onChange={(e) => router.push(`/videos?client=${e.target.value}`)} className="h-10 rounded-md border border-paper/20 bg-white/10 px-3 text-sm font-bold text-paper"><option className="text-ink" value="">Cliente</option>{clients.map((client) => <option className="text-ink" key={client.id} value={client.slug}>{client.name}</option>)}</select></div>
      <div className="relative mt-6 grid grid-cols-3 gap-3"><Metric value={products.length} label="Productos"/><Metric value={ideas.filter((idea) => !["PUBLISHED", "DISCARDED"].includes(idea.status)).length} label="En producción"/><Metric value={trends.filter((trend) => trend.analysisStatus === "ANALYZED").length} label="Formatos listos"/></div>
    </header>
    <nav className="mt-6 flex gap-1 border-b border-ink/10">{([ ["create", "Crear idea"], ["lab", "Laboratorio"], ["production", "Producción"] ] as [Tab, string][]).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`px-4 py-3 text-sm font-black ${tab === id ? "border-b-2 border-brass text-ink" : "text-slate"}`}>{label}</button>)}</nav>
    {tab === "create" && <section className="mt-7 grid gap-6 lg:grid-cols-[.9fr_1.4fr]"><div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-brass">1. Punto de partida</p><h2 className="mt-2 font-display text-2xl font-bold">¿Qué queremos mover?</h2><label className="mt-5 grid gap-2 text-sm font-bold">Producto<select value={productId} onChange={(e) => setProductId(e.target.value)} className="h-11 rounded-md border border-ink/15 bg-paper px-3">{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.brand.name}</option>)}</select></label>{currentProduct && <p className="mt-3 rounded-md bg-moss/10 p-3 text-sm leading-6 text-slate">{currentProduct.description}</p>}<p className="mt-6 text-xs font-black uppercase tracking-wider text-brass">2. Intención</p><div className="mt-3 grid gap-2">{INTENTS.map((option) => <button key={option.value} onClick={() => setIntent(option.value)} className={`rounded-lg border p-3 text-left ${intent === option.value ? "border-brass bg-brass/10" : "border-ink/10 hover:bg-paper"}`}><span className="block text-sm font-black">{option.label}</span><span className="mt-1 block text-xs text-slate">{option.hint}</span></button>)}</div><button disabled={loading || !productId} onClick={generateAngles} className="mt-6 h-11 w-full rounded-md bg-ink text-sm font-black text-paper hover:bg-ink/90 disabled:opacity-50">{loading ? "Pensando formatos…" : "Proponer 3 ideas"}</button></div>
      <div><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-brass">3. Elegir una dirección</p><h2 className="mt-1 font-display text-2xl font-bold">Ángulos grabables</h2></div>{angles.length > 0 && <span className="text-xs font-bold text-slate">Elegí uno para aprobarlo</span>}</div>{angles.length === 0 ? <Empty title="Una idea primero, un guion después" body="Elegí producto e intención. Vas a recibir tres maneras concretas de mostrarlo."/> : <div className="grid gap-4 xl:grid-cols-3">{angles.map((angle, index) => <article key={`${angle.hook}-${index}`} className="flex min-h-[360px] flex-col rounded-xl border border-ink/10 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="rounded bg-moss/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-moss">{angle.format}</span><span className="text-sm tracking-[2px] text-brass" aria-label={`Viabilidad ${angle.viabilityScore} de 5`}>{score(angle.viabilityScore)}</span></div><h3 className="mt-5 font-display text-xl font-bold leading-tight">“{angle.hook}”</h3><Detail label="Por qué funciona" text={angle.rationale}/><Detail label="Cómo se graba" text={angle.visualDirection}/><button disabled={saving} onClick={() => approveAngle(angle)} className="mt-auto h-10 rounded-md bg-ink text-xs font-black text-paper hover:bg-ink/90">Aprobar idea</button></article>)}</div>}</div></section>}
    {tab === "lab" && <section className="mt-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-brass">Biblioteca de referencias</p><h2 className="mt-1 font-display text-2xl font-bold">Laboratorio</h2></div><select value={labFilter} onChange={(e) => setLabFilter(e.target.value)} className="h-10 rounded-md border border-ink/15 bg-white px-3 text-sm font-bold"><option value="ALL">Todas las referencias</option><option value="READY">Analizadas y grabables</option><option value="PENDING">Pendientes de análisis</option><option value="NEEDS_REVIEW">Solo inspiración</option></select></div><div className="mt-5 grid gap-4 lg:grid-cols-2">{lab.map((trend) => <article key={trend.id} className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-black uppercase tracking-wider text-brass">{PLATFORM[trend.platform] || trend.platform}</span><h3 className="mt-2 text-lg font-black leading-tight">{trend.title}</h3></div>{trend.viabilityScore > 0 && <span className="text-sm tracking-[2px] text-brass">{score(trend.viabilityScore)}</span>}</div>{trend.analysisStatus === "ANALYZED" ? <div className="mt-4 grid gap-3 rounded-lg bg-paper p-4"><Detail label="La fórmula" text={trend.viralFormula}/><Detail label="Adaptación sugerida" text={trend.suggestedAngle}/><Detail label="Dirección visual" text={trend.visualDirection}/><div className="flex flex-wrap gap-2 pt-1">{trend.sourceUrl && <a href={trend.sourceUrl} target="_blank" rel="noreferrer" className="rounded-md border border-ink/15 px-3 py-2 text-xs font-black">Ver fuente</a>}<button onClick={() => createFromTrend(trend)} className="rounded-md bg-ink px-3 py-2 text-xs font-black text-paper">Convertir en idea</button></div></div> : <div className="mt-4"><p className="line-clamp-3 text-sm leading-6 text-slate">{trend.description}</p><button disabled={saving} onClick={() => analyze(trend.id)} className="mt-4 rounded-md border border-ink/15 px-3 py-2 text-xs font-black">{saving ? "Analizando…" : trend.analysisStatus === "NEEDS_REVIEW" ? "Reintentar análisis" : "Analizar referencia"}</button></div>}</article>)}</div>{lab.length === 0 && <Empty title="Todavía no hay referencias" body="El radar irá alimentando este laboratorio sin bloquear la creación por producto."/>}</section>}
    {tab === "production" && <section className="mt-7"><p className="text-xs font-black uppercase tracking-wider text-brass">Seguimiento editorial</p><h2 className="mt-1 font-display text-2xl font-bold">Producción</h2><div className="mt-5 grid gap-4">{ideas.map((idea) => <article key={idea.id} className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap gap-2 text-xs font-bold text-slate"><span>{idea.product.name}</span><span>·</span><span>{idea.product.brand.name}</span>{idea.trend && <><span>·</span><span>{idea.trend.title}</span></>}</div><h3 className="mt-2 font-display text-xl font-bold">{idea.hook}</h3><p className="mt-2 text-sm text-slate">{idea.format} · {idea.visualDirection}</p></div><div className="flex flex-wrap items-center gap-2"><select value={idea.status} onChange={(e) => updateStatus(idea.id, e.target.value as ContentIdeaStatus)} className="h-9 rounded-md border border-ink/15 bg-paper px-2 text-xs font-black">{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{idea.status === "APPROVED" && <button onClick={() => setSelectedIdea(idea)} className="h-9 rounded-md bg-ink px-3 text-xs font-black text-paper">Generar guion</button>}{idea.videoScripts.length > 0 && <span className="rounded-md bg-moss/10 px-3 py-2 text-xs font-black text-moss">Guion creado</span>}</div></div></article>)}</div>{ideas.length === 0 && <Empty title="No hay ideas aprobadas" body="Creá una idea desde un producto o convertí una referencia del laboratorio."/>}<div className="mt-8"><h3 className="font-display text-xl font-bold">Guiones recientes</h3><div className="mt-3 grid gap-3">{scripts.map((script) => <article key={script.id} className="rounded-lg border border-ink/10 bg-white p-4"><p className="text-xs font-black uppercase tracking-wider text-brass">{script.product?.name || "Producto"} · {script.persona.name}</p><h4 className="mt-2 font-bold">{script.hook}</h4><p className="mt-2 line-clamp-2 text-sm text-slate">{script.bodyText}</p></article>)}</div></div></section>}
  </main>{selectedIdea && <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"><div className="w-full max-w-md rounded-xl bg-paper p-6 shadow-panel"><p className="text-xs font-black uppercase tracking-wider text-brass">Guion desde idea aprobada</p><h2 className="mt-2 font-display text-2xl font-bold">{selectedIdea.hook}</h2><label className="mt-5 grid gap-2 text-sm font-bold">Voz / persona<select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="h-11 rounded-md border border-ink/15 bg-white px-3">{personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.name}</option>)}</select></label><div className="mt-6 flex justify-end gap-2"><button onClick={() => setSelectedIdea(null)} className="h-10 rounded-md border border-ink/15 px-4 text-sm font-black">Cancelar</button><button disabled={saving} onClick={generateScript} className="h-10 rounded-md bg-ink px-4 text-sm font-black text-paper">{saving ? "Generando…" : "Generar guion"}</button></div></div></div>}</div>;
}
function Metric({ value, label }: { value: number; label: string }) { return <div className="rounded-lg border border-paper/15 bg-white/10 p-3"><p className="font-display text-2xl font-bold">{value}</p><p className="text-[10px] font-black uppercase tracking-wider text-paper/65">{label}</p></div>; }
function Detail({ label, text }: { label: string; text: string }) { return <div><p className="text-[10px] font-black uppercase tracking-wider text-brass">{label}</p><p className="mt-1 text-sm leading-5 text-slate">{text || "Pendiente de definir."}</p></div>; }
function Empty({ title, body }: { title: string; body: string }) { return <div className="rounded-xl border border-dashed border-ink/20 bg-white/60 p-12 text-center"><h3 className="font-display text-2xl font-bold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate">{body}</p></div>; }
