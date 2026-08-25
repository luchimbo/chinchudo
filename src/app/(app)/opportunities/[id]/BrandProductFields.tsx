"use client";

import { useMemo, useState } from "react";

type Brand = { id: string; name: string };
type Product = { id: string; name: string; brandId: string };

export function BrandProductFields({ brands, products, brandId, productId, dark = false }: {
  brands: Brand[];
  products: Product[];
  brandId: string;
  productId: string;
  dark?: boolean;
}) {
  const [selectedBrand, setSelectedBrand] = useState(brandId);
  const available = useMemo(() => products.filter((product) => product.brandId === selectedBrand), [products, selectedBrand]);
  const initialProduct = available.some((product) => product.id === productId) ? productId : available[0]?.id ?? "";
  const [selectedProduct, setSelectedProduct] = useState(initialProduct);
  const label = dark ? "text-paper/80" : "text-slate";
  return <>
    <label className={`grid gap-2 text-sm font-semibold ${label}`}>
      Marca
      <select name="brandId" value={selectedBrand} onChange={(event) => {
        const nextBrandId = event.target.value;
        setSelectedBrand(nextBrandId);
        setSelectedProduct(products.find((product) => product.brandId === nextBrandId)?.id ?? "");
      }} className="w-full rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink">
        {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </select>
    </label>
    <label className={`grid gap-2 text-sm font-semibold ${label}`}>
      Producto
      <select name="productId" value={selectedProduct} onChange={(event) => setSelectedProduct(event.target.value)} className="w-full rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink">
        <option value="">Sin producto específico</option>
        {available.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
      </select>
    </label>
  </>;
}
