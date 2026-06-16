import Link from "next/link";
import { prisma } from "@/lib/db";
import { createProduct, updateProduct, deleteProduct } from "./actions";

type BrandOpt = { id: string; name: string };

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";

function BrandSelect({ brands, value }: { brands: BrandOpt[]; value?: string }) {
  return (
    <label className={labelCls}>
      Marca
      <select name="brandId" defaultValue={value ?? ""} required className={inputCls}>
        <option value="" disabled>Elegir marca</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}

export default async function ProductsPage() {
  const [brands, products] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.product.findMany({ include: { brand: true }, orderBy: [{ brand: { name: "asc" } }, { name: "asc" }] })
  ]);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-moss">Catálogo</p>
          <h1 className="font-display text-4xl text-ink">Productos</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate">
            Specs, garantía, stock y precio. Estos datos alimentan el contexto de las respuestas.
          </p>
        </div>
        <Link href="/" className="rounded-full border border-ink/20 bg-white/50 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white">
          Volver
        </Link>
      </header>

      <section className="mb-10">
        <h2 className="font-display text-2xl text-ink">Nuevo producto</h2>
        <form action={createProduct} className="mt-4 grid gap-3 rounded-lg border border-ink/10 bg-white/70 p-4 shadow-panel md:grid-cols-2">
          <BrandSelect brands={brands} />
          <label className={labelCls}>
            Nombre
            <input name="name" required className={inputCls} />
          </label>
          <label className={labelCls}>
            Categoría
            <input name="category" required placeholder="Controlador MIDI, Batería electrónica..." className={inputCls} />
          </label>
          <label className={labelCls}>
            Stock
            <input name="stockStatus" placeholder="Por confirmar" className={inputCls} />
          </label>
          <label className={labelCls}>
            Precio
            <input name="priceRange" placeholder="Por confirmar" className={inputCls} />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            Descripción
            <textarea name="description" rows={2} className={`${inputCls} resize-y`} />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            Specs técnicas
            <textarea name="technicalSpecs" rows={2} className={`${inputCls} resize-y`} />
          </label>
          <label className={labelCls}>
            Casos de uso
            <input name="useCases" className={inputCls} />
          </label>
          <label className={labelCls}>
            Notas de garantía
            <input name="warrantyNotes" className={inputCls} />
          </label>
          <div className="flex items-end justify-end md:col-span-2">
            <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-slate">Agregar producto</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink">Catálogo ({products.length})</h2>
        <div className="mt-4 grid gap-3">
          {products.map((p) => (
            <form key={p.id} action={updateProduct} className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 md:grid-cols-2">
              <input type="hidden" name="id" value={p.id} />
              <BrandSelect brands={brands} value={p.brandId} />
              <label className={labelCls}>
                Nombre
                <input name="name" defaultValue={p.name} required className={inputCls} />
              </label>
              <label className={labelCls}>
                Categoría
                <input name="category" defaultValue={p.category} required className={inputCls} />
              </label>
              <label className={labelCls}>
                Stock
                <input name="stockStatus" defaultValue={p.stockStatus} className={inputCls} />
              </label>
              <label className={labelCls}>
                Precio
                <input name="priceRange" defaultValue={p.priceRange} className={inputCls} />
              </label>
              <label className={labelCls}>
                Casos de uso
                <input name="useCases" defaultValue={p.useCases} className={inputCls} />
              </label>
              <label className={`${labelCls} md:col-span-2`}>
                Descripción
                <textarea name="description" defaultValue={p.description} rows={2} className={`${inputCls} resize-y`} />
              </label>
              <label className={`${labelCls} md:col-span-2`}>
                Specs técnicas
                <textarea name="technicalSpecs" defaultValue={p.technicalSpecs} rows={2} className={`${inputCls} resize-y`} />
              </label>
              <label className={`${labelCls} md:col-span-2`}>
                Notas de garantía
                <input name="warrantyNotes" defaultValue={p.warrantyNotes} className={inputCls} />
              </label>
              <div className="flex items-end justify-end gap-2 md:col-span-2">
                <button className="rounded-full border border-ink/20 px-4 py-2 text-sm font-bold text-ink hover:bg-white">Guardar</button>
                <button formAction={deleteProduct} className="rounded-full border border-red-300 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Eliminar</button>
              </div>
            </form>
          ))}
          {products.length === 0 ? <p className="rounded-md bg-paper p-4 text-sm text-slate">Sin productos cargados.</p> : null}
        </div>
      </section>
    </main>
  );
}
