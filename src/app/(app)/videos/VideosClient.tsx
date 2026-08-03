"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Client, Persona, Product, Trend, VideoScript } from "@prisma/client";

type Script = VideoScript & { product: Product | null; persona: Persona; trend: { title: string } | null; contentIdea: { hook: string } | null };
type Props = { activeClient: Client; clients: Client[]; trends: Trend[]; products: (Product & { brand: { name: string } })[]; scripts: Script[] };
type Tab = "create" | "references" | "history";

const PLATFORM: Record<string, string> = { TIKTOK: "TikTok", TIKTOK_HASHTAG: "TikTok", INSTAGRAM: "Instagram", YOUTUBE: "YouTube Shorts", TIKTOK_CREATIVE_CENTER: "TikTok", VIRAL_MARKETING: "Formato" };

function referenceType(platform: string) {
  if (platform === "TIKTOK_CREATIVE_CENTER" || platform === "TIKTOK_HASHTAG") return "Hashtag";
  if (platform === "VIRAL_MARKETING") return "Formato";
  return "Video";
}

export default function VideosClient({ activeClient, clients, trends, products, scripts }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);

  async function generateScript() {
    if (!productId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_script", clientId: activeClient.id, productId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "No se pudo generar el guion.");
      setSelectedScript(data.script as Script);
      router.refresh();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  return <div className="video-studio min-h-screen overflow-x-hidden bg-paper text-ink"><main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-7">
    <header className="relative overflow-hidden rounded-2xl border border-ink/10 bg-ink px-4 py-6 text-paper shadow-panel sm:px-6 sm:py-7">
      <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full bg-brass/30 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[.16em] text-brass sm:tracking-[.22em]">Estudio editorial · {activeClient.name}</p><h1 className="mt-2 break-words font-display text-3xl font-bold sm:text-4xl">Guiones para grabar</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-paper/75">Elegí un producto y generá un guion listo para revisar.</p></div><select value={activeClient.slug} onChange={(event) => router.push(`/videos?client=${event.target.value}`)} className="h-10 w-full max-w-full rounded-md border border-paper/20 bg-white/10 px-3 text-sm font-bold text-paper sm:w-auto sm:min-w-48">{clients.map((client) => <option className="text-ink" key={client.id} value={client.slug}>{client.name}</option>)}</select></div>
      <div className="relative mt-6 grid grid-cols-3 gap-3"><Metric value={products.length} label="Productos"/><Metric value={scripts.length} label="Guiones"/><Metric value={trends.length} label="Referencias"/></div>
    </header>
    <nav aria-label="Secciones de guiones" className="-mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-ink/10 px-4 sm:mx-0 sm:mt-6 sm:px-0">{([ ["create", "Crear guion"], ["references", "Referencias"], ["history", "Guiones"] ] as [Tab, string][]).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`shrink-0 whitespace-nowrap px-3 py-3 text-sm font-black sm:px-4 ${tab === id ? "border-b-2 border-brass text-ink" : "text-slate"}`}>{label}</button>)}</nav>

    {tab === "create" && <section className="mx-auto mt-10 max-w-2xl rounded-2xl border border-ink/10 bg-white p-6 shadow-panel sm:p-8"><p className="text-xs font-black uppercase tracking-wider text-brass">Nuevo guion</p><h2 className="mt-2 font-display text-3xl font-bold">Elegí el producto</h2><p className="mt-2 text-sm leading-6 text-slate">El sistema elige automáticamente el enfoque adecuado y prepara el guion.</p><label className="mt-7 grid gap-2 text-sm font-bold">Producto<select value={productId} onChange={(event) => setProductId(event.target.value)} className="h-12 rounded-md border border-ink/15 bg-paper px-3">{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.brand.name}</option>)}</select></label><button disabled={saving || !productId} onClick={generateScript} className="mt-6 h-12 w-full rounded-md bg-ink text-sm font-black text-paper transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Generando guion…" : "Generar guion"}</button>{products.length === 0 && <p className="mt-4 text-sm text-slate">No hay productos disponibles para este cliente.</p>}</section>}

    {tab === "references" && <section className="mt-7"><p className="text-xs font-black uppercase tracking-wider text-brass">Referencias para {activeClient.name}</p><h2 className="mt-1 font-display text-2xl font-bold">Videos que sirven para este rubro</h2><div className="mt-5 grid gap-4 lg:grid-cols-2">{trends.map((trend) => <article key={trend.id} className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-moss/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-moss">{referenceType(trend.platform)}</span><span className="text-[10px] font-black uppercase tracking-wider text-brass">{PLATFORM[trend.platform] || trend.platform}</span></div><h3 className="mt-3 text-lg font-black leading-tight">{trend.title}</h3><p className="mt-3 line-clamp-3 text-sm leading-6 text-slate">{trend.description}</p>{trend.sourceUrl && <a href={trend.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-md border border-ink/15 px-3 py-2 text-xs font-black">Ver video</a>}</article>)}</div>{trends.length === 0 && <Empty title="Todavía no hay referencias" body="Cuando el radar encuentre videos relevantes, se mostrarán acá."/>}</section>}

    {tab === "history" && <section className="mt-7"><p className="text-xs font-black uppercase tracking-wider text-brass">Historial</p><h2 className="mt-1 font-display text-2xl font-bold">Guiones recientes</h2><div className="mt-5 grid gap-3">{scripts.map((script) => <button key={script.id} onClick={() => setSelectedScript(script)} className="rounded-lg border border-ink/10 bg-white p-4 text-left shadow-sm transition hover:border-brass/50"><p className="text-xs font-black uppercase tracking-wider text-brass">{script.product?.name || "Producto"} · {script.persona.name}</p><h3 className="mt-2 font-bold">{script.hook}</h3><p className="mt-2 line-clamp-2 text-sm text-slate">{script.bodyText}</p></button>)}</div>{scripts.length === 0 && <Empty title="Todavía no hay guiones" body="Generá el primero desde un producto."/>}</section>}
  </main>{selectedScript && <ScriptDialog script={selectedScript} onClose={() => setSelectedScript(null)} />}</div>;
}

function ScriptDialog({ script, onClose }: { script: Script; onClose: () => void }) { return <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/70 p-4 sm:p-8"><div role="dialog" aria-modal="true" aria-label="Guion generado" className="mx-auto my-4 w-full max-w-3xl rounded-2xl bg-paper p-6 shadow-panel sm:my-10 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-brass">Guion generado · {script.persona.name}</p><h2 className="mt-2 font-display text-2xl font-bold">{script.product?.name || "Producto"}</h2></div><button onClick={onClose} className="rounded-md border border-ink/15 px-3 py-2 text-xs font-black">Cerrar</button></div><ScriptField label="Gancho" text={script.hook}/><ScriptField label="Guion" text={script.bodyText}/><ScriptField label="Cierre" text={script.cta}/><ScriptField label="Indicaciones visuales" text={script.visualCues}/></div></div>; }
function ScriptField({ label, text }: { label: string; text: string }) { return <section className="mt-6"><p className="text-xs font-black uppercase tracking-wider text-brass">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{text}</p></section>; }
function Metric({ value, label }: { value: number; label: string }) { return <div className="rounded-lg border border-paper/15 bg-white/10 p-3"><p className="font-display text-2xl font-bold">{value}</p><p className="text-[10px] font-black uppercase tracking-wider text-paper/65">{label}</p></div>; }
function Empty({ title, body }: { title: string; body: string }) { return <div className="rounded-xl border border-dashed border-ink/20 bg-white/60 p-12 text-center"><h3 className="font-display text-2xl font-bold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate">{body}</p></div>; }
