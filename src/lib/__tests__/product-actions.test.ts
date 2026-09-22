import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  products: [] as { id: string; name: string; brandId: string; clientId: string }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-guards", () => ({ requireOwnedClientId: vi.fn(async () => ({})) }));
vi.mock("@/lib/db", () => {
  const brands: Record<string, { clientId: string; name: string }> = {
    "brand-alctron": { clientId: "pcmidi", name: "ALCTRON" },
    "brand-midiplus": { clientId: "pcmidi", name: "MIDIPLUS" },
    "brand-prestige": { clientId: "prestige", name: "PRESTIGE" },
  };
  return {
    prisma: {
      brand: { findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => brands[where.id]) },
      product: {
        findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
          const product = state.products.find((item) => item.id === where.id)!;
          return { brand: { clientId: product.clientId } };
        }),
        findMany: vi.fn(async ({ where }: { where: { brand: { clientId: string }; id?: { not: string } } }) => state.products
          .filter((item) => item.clientId === where.brand.clientId && item.id !== where.id?.not)
          .map((item) => ({ id: item.id, name: item.name, brand: { name: brands[item.brandId].name } }))),
        create: vi.fn(async ({ data }: { data: { name: string; brandId: string } }) => {
          state.products.push({ id: `nuevo-${state.products.length}`, name: data.name, brandId: data.brandId, clientId: brands[data.brandId].clientId });
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: { name: string } }) => {
          Object.assign(state.products.find((item) => item.id === where.id)!, { name: data.name });
        }),
      },
    },
  };
});

import { createProduct, updateProduct } from "@/app/(app)/products/actions";

function productForm(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ category: "microfonos", ...values })) form.set(key, value);
  return form;
}

describe("alta y edición manual de productos", () => {
  beforeEach(() => {
    state.products = [
      { id: "alctron-um900", name: "Microfono Condensador USB Alctron UM900", brandId: "brand-alctron", clientId: "pcmidi" },
      { id: "midiplus-bm800", name: "Micrófono Condenser Midiplus BM800", brandId: "brand-midiplus", clientId: "pcmidi" },
    ];
  });

  it("no deja cargar un producto que ya existe con otro formato de nombre, aunque sea otra marca", async () => {
    const result = await createProduct({ error: null }, productForm({ brandId: "brand-midiplus", name: "MICRÓFONO CONDENSADOR USB ALCTRON UM900" }));

    expect(result.error).toContain("Ya existe «Microfono Condensador USB Alctron UM900» (ALCTRON)");
    expect(state.products).toHaveLength(2);
  });

  it("carga normalmente un producto nuevo y el mismo nombre en otro cliente", async () => {
    expect(await createProduct({ error: null }, productForm({ brandId: "brand-alctron", name: "Alctron UM900 Pro" }))).toEqual({ error: null });
    expect(await createProduct({ error: null }, productForm({ brandId: "brand-prestige", name: "Microfono Condensador USB Alctron UM900" }))).toEqual({ error: null });
    expect(state.products).toHaveLength(4);
  });

  it("no deja renombrar un producto con el nombre de otro, pero sí guardar el propio", async () => {
    const renamed = await updateProduct({ error: null }, productForm({ id: "midiplus-bm800", brandId: "brand-midiplus", name: "microfono condensador usb alctron um900" }));
    expect(renamed.error).toContain("Ya existe");
    expect(state.products[1].name).toBe("Micrófono Condenser Midiplus BM800");

    const saved = await updateProduct({ error: null }, productForm({ id: "midiplus-bm800", brandId: "brand-midiplus", name: "Micrófono Condenser MIDIPLUS BM800" }));
    expect(saved).toEqual({ error: null });
    expect(state.products[1].name).toBe("Micrófono Condenser MIDIPLUS BM800");
  });
});
