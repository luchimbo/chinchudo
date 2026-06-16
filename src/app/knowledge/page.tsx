import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  createKnowledge,
  updateKnowledge,
  deleteKnowledge,
  createObjection,
  updateObjection,
  deleteObjection
} from "./actions";

type BrandOpt = { id: string; name: string };
type ProductOpt = { id: string; name: string; brand: { name: string } };

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";

function BrandSelect({ brands, value }: { brands: BrandOpt[]; value?: string | null }) {
  return (
    <label className={labelCls}>
      Marca
      <select name="brandId" defaultValue={value ?? ""} className={inputCls}>
        <option value="">Todas / global</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}

function ProductSelect({ products, value }: { products: ProductOpt[]; value?: string | null }) {
  return (
    <label className={labelCls}>
      Producto
      <select name="productId" defaultValue={value ?? ""} className={inputCls}>
        <option value="">Sin asociar</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>{p.brand.name} - {p.name}</option>
        ))}
      </select>
    </label>
  );
}

export default async function KnowledgePage() {
  const [brands, products, faqs, objections] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.product.findMany({ include: { brand: true }, orderBy: [{ brand: { name: "asc" } }, { name: "asc" }] }),
    prisma.knowledgeBase.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.objection.findMany({ orderBy: { updatedAt: "desc" } })
  ]);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-moss">Base de conocimiento</p>
          <h1 className="font-display text-4xl text-ink">FAQs y objeciones</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate">
            Lo que cargues acá se inyecta como datos verificados al generar respuestas. La IA no debe inventar fuera de esto.
          </p>
        </div>
        <Link href="/" className="rounded-full border border-ink/20 bg-white/50 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white">
          Volver
        </Link>
      </header>

      {/* ===== FAQs ===== */}
      <section className="mb-10">
        <h2 className="font-display text-2xl text-ink">Datos verificados ({faqs.length})</h2>

        <form action={createKnowledge} className="mt-4 grid gap-3 rounded-lg border border-ink/10 bg-white/70 p-4 shadow-panel md:grid-cols-2">
          <BrandSelect brands={brands} />
          <ProductSelect products={products} />
          <label className={`${labelCls} md:col-span-2`}>
            Tema
            <input name="topic" required placeholder="Ej: Garantía MidiPlus" className={inputCls} />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            Contenido (dato verificado)
            <textarea name="content" required rows={3} className={`${inputCls} resize-y`} />
          </label>
          <label className={labelCls}>
            Confianza
            <select name="confidence" defaultValue="medium" className={inputCls}>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </label>
          <div className="flex items-end justify-end md:col-span-2">
            <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-slate">Agregar FAQ</button>
          </div>
        </form>

        <div className="mt-4 grid gap-3">
          {faqs.map((f) => (
            <form key={f.id} action={updateKnowledge} className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 md:grid-cols-2">
              <input type="hidden" name="id" value={f.id} />
              <BrandSelect brands={brands} value={f.brandId} />
              <ProductSelect products={products} value={f.productId} />
              <label className={`${labelCls} md:col-span-2`}>
                Tema
                <input name="topic" defaultValue={f.topic} required className={inputCls} />
              </label>
              <label className={`${labelCls} md:col-span-2`}>
                Contenido
                <textarea name="content" defaultValue={f.content} required rows={2} className={`${inputCls} resize-y`} />
              </label>
              <label className={labelCls}>
                Confianza
                <select name="confidence" defaultValue={f.confidence} className={inputCls}>
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                </select>
              </label>
              <div className="flex items-end justify-between gap-2 md:col-span-2">
                <span className="text-xs text-slate/60">{f.source === "seed" ? "Origen: seed" : "Origen: manual"}</span>
                <div className="flex gap-2">
                  <button className="rounded-full border border-ink/20 px-4 py-2 text-sm font-bold text-ink hover:bg-white">Guardar</button>
                  <button formAction={deleteKnowledge} className="rounded-full border border-red-300 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Eliminar</button>
                </div>
              </div>
            </form>
          ))}
          {faqs.length === 0 ? <p className="rounded-md bg-paper p-4 text-sm text-slate">Sin FAQs cargadas.</p> : null}
        </div>
      </section>

      {/* ===== Objeciones ===== */}
      <section>
        <h2 className="font-display text-2xl text-ink">Objeciones ({objections.length})</h2>

        <form action={createObjection} className="mt-4 grid gap-3 rounded-lg border border-ink/10 bg-white/70 p-4 shadow-panel md:grid-cols-2">
          <BrandSelect brands={brands} />
          <ProductSelect products={products} />
          <label className={`${labelCls} md:col-span-2`}>
            Objeción
            <input name="objection" required placeholder="Ej: Es muy barato, debe ser malo" className={inputCls} />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            Respuesta recomendada
            <textarea name="recommendedAnswer" required rows={3} className={`${inputCls} resize-y`} />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            Notas de persona (opcional)
            <input name="personaNotes" placeholder="Ej: útil para Cazador de Ofertas" className={inputCls} />
          </label>
          <div className="flex items-end justify-end md:col-span-2">
            <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-slate">Agregar objeción</button>
          </div>
        </form>

        <div className="mt-4 grid gap-3">
          {objections.map((o) => (
            <form key={o.id} action={updateObjection} className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 md:grid-cols-2">
              <input type="hidden" name="id" value={o.id} />
              <BrandSelect brands={brands} value={o.brandId} />
              <ProductSelect products={products} value={o.productId} />
              <label className={`${labelCls} md:col-span-2`}>
                Objeción
                <input name="objection" defaultValue={o.objection} required className={inputCls} />
              </label>
              <label className={`${labelCls} md:col-span-2`}>
                Respuesta recomendada
                <textarea name="recommendedAnswer" defaultValue={o.recommendedAnswer} required rows={2} className={`${inputCls} resize-y`} />
              </label>
              <label className={`${labelCls} md:col-span-2`}>
                Notas de persona
                <input name="personaNotes" defaultValue={o.personaNotes} className={inputCls} />
              </label>
              <div className="flex items-end justify-end gap-2 md:col-span-2">
                <button className="rounded-full border border-ink/20 px-4 py-2 text-sm font-bold text-ink hover:bg-white">Guardar</button>
                <button formAction={deleteObjection} className="rounded-full border border-red-300 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Eliminar</button>
              </div>
            </form>
          ))}
          {objections.length === 0 ? <p className="rounded-md bg-paper p-4 text-sm text-slate">Sin objeciones cargadas.</p> : null}
        </div>
      </section>
    </main>
  );
}
