/**
 * Identidad de catálogo. Dentro de un cliente, dos productos (o dos marcas) cuyo
 * nombre coincide sin importar mayúsculas, acentos ni signos son el mismo. Las
 * importaciones usan este índice para actualizar el existente en lugar de crear
 * un repetido, que después aparece dos veces en el Asistente CM.
 */
export function catalogNameKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    // La tienda antepone "PREVENTA" mientras el producto no llegó: es un estado de venta, no otro producto.
    // "OUTLET" sí se mantiene: es otra unidad, con otro precio.
    .replace(/^preventa\s+/, "");
}

type CatalogRow = { id: string; name: string; sourceExternalId?: string | null };

export class CatalogIndex<T extends CatalogRow> {
  private readonly byId = new Map<string, T>();
  private readonly byExternalId = new Map<string, T>();
  private readonly byName = new Map<string, T>();

  constructor(rows: T[] = []) {
    for (const row of rows) this.remember(row);
  }

  /** Prioriza lo estable (id, SKU/id externo) y después el nombre normalizado. */
  find(match: { id?: string | null; externalId?: string | null; name: string }): T | null {
    return (match.id ? this.byId.get(match.id) : undefined)
      ?? (match.externalId ? this.byExternalId.get(match.externalId) : undefined)
      ?? this.byName.get(catalogNameKey(match.name))
      ?? null;
  }

  /** Registra una fila creada o actualizada para que el resto de la importación la reconozca. */
  remember(row: T) {
    if (row.id) this.byId.set(row.id, row);
    if (row.sourceExternalId) this.byExternalId.set(row.sourceExternalId, row);
    const key = catalogNameKey(row.name);
    if (key) this.byName.set(key, row);
  }
}

export const catalogProductSelect = {
  id: true,
  name: true,
  brandId: true,
  category: true,
  description: true,
  useCases: true,
  sourceType: true,
  sourceExternalId: true,
} as const;

export type CatalogProduct = {
  id: string;
  name: string;
  brandId: string;
  category: string;
  description: string;
  useCases: string;
  sourceType: string;
  sourceExternalId: string | null;
};

type CatalogDb = {
  brand: { findMany: (args: { where: { clientId: string }; select: { id: true; name: true } }) => Promise<{ id: string; name: string }[]> };
  product: { findMany: (args: { where: { brand: { clientId: string } }; select: typeof catalogProductSelect }) => Promise<CatalogProduct[]> };
};

type NamedProductDb = {
  product: {
    findMany: (args: {
      where: { brand: { clientId: string | null }; id?: { not: string } };
      select: { id: true; name: true; brand: { select: { name: true } } };
    }) => Promise<{ id: string; name: string; brand: { name: string } }[]>;
  };
};

/** Producto del cliente con el mismo nombre normalizado; frena un alta o un renombre que lo repetiría. */
export async function findClientProductNamed(db: NamedProductDb, clientId: string | null, name: string, excludeId?: string) {
  const key = catalogNameKey(name);
  if (!key) return null;
  const rows = await db.product.findMany({
    where: { brand: { clientId }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true, brand: { select: { name: true } } },
  });
  return rows.find((row) => catalogNameKey(row.name) === key) ?? null;
}

/** Carga una sola vez las marcas y productos del cliente (sirve para PrismaClient y para una transacción). */
export async function loadClientCatalogIndex(db: CatalogDb, clientId: string) {
  const [brands, products] = await Promise.all([
    db.brand.findMany({ where: { clientId }, select: { id: true, name: true } }),
    db.product.findMany({ where: { brand: { clientId } }, select: catalogProductSelect }),
  ]);
  return { brands: new CatalogIndex(brands), products: new CatalogIndex(products) };
}
