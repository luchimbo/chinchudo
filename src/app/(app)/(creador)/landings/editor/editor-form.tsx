"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoUpload } from "@/app/(app)/configuracion/logo-upload";

type Template = {
  id: string;
  name: string;
  desc: string;
  bgColor: string;
  accentColor: string;
  renderMini: () => React.ReactNode;
};

const TEMPLATES: Template[] = [
  {
    id: "minimalist",
    name: "Minimalista Moderno",
    desc: "Diseño limpio, claro y de alto contraste para presentar una guia comercial simple.",
    bgColor: "bg-white",
    accentColor: "bg-ink",
    renderMini: () => (
      <div className="flex h-24 w-full flex-col justify-between rounded-lg border border-ink/10 bg-white p-2">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/5 pb-1">
          <div className="h-2 w-6 rounded bg-ink/20" />
          <div className="h-2 w-4 rounded bg-ink/20" />
        </div>
        {/* Body */}
        <div className="flex gap-2 py-1">
          <div className="flex-1 space-y-1">
            <div className="h-2 w-full rounded bg-ink/30" />
            <div className="h-1.5 w-5/6 rounded bg-ink/10" />
            <div className="h-1.5 w-4/6 rounded bg-ink/10" />
          </div>
          <div className="h-8 w-8 rounded bg-ink/5 border border-ink/5" />
        </div>
        {/* Button */}
        <div className="h-2 w-full rounded bg-ink" />
      </div>
    ),
  },
  {
    id: "pro-dark",
    name: "Profesional Oscuro",
    desc: "Interfaz oscura, tecnica y sobria para marcas que necesitan transmitir precision.",
    bgColor: "bg-zinc-900",
    accentColor: "bg-emerald-500",
    renderMini: () => (
      <div className="flex h-24 w-full flex-col justify-between rounded-lg border border-zinc-750 bg-zinc-950 p-2 text-zinc-400">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-1">
          <div className="h-2 w-6 rounded bg-zinc-800" />
          <div className="h-2 w-4 rounded bg-zinc-800" />
        </div>
        {/* Body */}
        <div className="flex gap-2 py-1">
          <div className="flex-1 space-y-1">
            <div className="h-2 w-full rounded bg-zinc-700" />
            <div className="h-1.5 w-5/6 rounded bg-zinc-800" />
            <div className="h-1.5 w-4/6 rounded bg-zinc-800" />
          </div>
          <div className="h-8 w-8 rounded bg-zinc-900 border border-zinc-800" />
        </div>
        {/* Button */}
        <div className="h-2 w-full rounded bg-emerald-500" />
      </div>
    ),
  },
  {
    id: "store-front",
    name: "Vitrina de Productos",
    desc: "Diseño orientado a catalogo, comparacion de opciones y lectura rapida de beneficios.",
    bgColor: "bg-slate-50",
    accentColor: "bg-blue-600",
    renderMini: () => (
      <div className="flex h-24 w-full flex-col justify-between rounded-lg border border-blue-100 bg-slate-50 p-2">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-blue-50 pb-1">
          <div className="h-2 w-6 rounded bg-blue-900/20" />
          <div className="h-2 w-4 rounded bg-blue-950/20" />
        </div>
        {/* Product Cards */}
        <div className="grid grid-cols-2 gap-1.5 py-1">
          <div className="rounded border border-blue-100/50 bg-white p-1 space-y-1">
            <div className="h-3 w-full rounded bg-slate-100" />
            <div className="h-1 w-3 rounded bg-blue-600/40" />
          </div>
          <div className="rounded border border-blue-100/50 bg-white p-1 space-y-1">
            <div className="h-3 w-full rounded bg-slate-100" />
            <div className="h-1 w-3 rounded bg-blue-600/40" />
          </div>
        </div>
        {/* Button */}
        <div className="h-2 w-1/2 rounded bg-blue-600 self-center" />
      </div>
    ),
  },
  {
    id: "editorial",
    name: "Lanzamiento / Editorial",
    desc: "Composicion editorial con titulares grandes para contenidos de mayor impacto visual.",
    bgColor: "bg-amber-50/30",
    accentColor: "bg-amber-700",
    renderMini: () => (
      <div className="flex h-24 w-full flex-col justify-between rounded-lg border border-amber-100 bg-amber-50/25 p-2">
        {/* Header */}
        <div className="h-1.5 w-1/4 rounded bg-amber-900/10" />
        {/* Big Hero Banner */}
        <div className="flex flex-col items-center gap-1 py-1 text-center">
          <div className="h-3 w-4/5 rounded bg-amber-950/30" />
          <div className="h-1.5 w-2/3 rounded bg-amber-900/15" />
          <div className="h-4 w-full rounded bg-amber-900/5 mt-0.5 border border-amber-900/5" />
        </div>
        {/* Button */}
        <div className="h-2 w-2/3 rounded bg-amber-700 self-center" />
      </div>
    ),
  },
];

type Config = {
  id: string;
  clientSlug: string;
  logoUrl: string;
  landingTemplate: string;
  landingPrimaryColor: string;
  landingSecondaryColor: string;
};

export function EditorForm({
  config,
  updateLandingTemplate,
}: {
  config: Config;
  updateLandingTemplate: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState(config.landingTemplate || "minimalist");
  const [logoUrl, setLogoUrl] = useState(config.logoUrl);
  const [primaryColor, setPrimaryColor] = useState(config.landingPrimaryColor || "#EB6517");
  const [secondaryColor, setSecondaryColor] = useState(config.landingSecondaryColor || "#F6A00C");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [actionLabel, setActionLabel] = useState<"preview" | "confirm">("preview");
  const [previewVersion, setPreviewVersion] = useState(0);

  const previewSrc = `/api/landings/preview?client=${encodeURIComponent(config.clientSlug)}&v=${previewVersion}`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value === "confirm" ? "confirm" : "preview";
    setActionLabel(intent);
    setSaving(true);
    setSaved(false);

    const fd = new FormData();
    fd.set("id", config.id);
    fd.set("logoUrl", logoUrl);
    fd.set("landingTemplate", selectedTemplate);
    fd.set("landingPrimaryColor", primaryColor);
    fd.set("landingSecondaryColor", secondaryColor);

    await updateLandingTemplate(fd);
    setSaving(false);
    setSaved(true);
    setPreviewVersion((version) => version + 1);
    router.refresh();
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      {/* 1. SELECCIÓN DE PLANTILLA */}
      <section className="rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="font-display text-xl font-bold text-ink">Plantilla de Diseño</h2>
          <p className="text-xs text-slate/75">
            Selecciona el estilo visual por defecto para las landings de este cliente.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {TEMPLATES.map((tpl) => {
            const active = selectedTemplate === tpl.id;
            return (
              <div
                key={tpl.id}
                onClick={() => setSelectedTemplate(tpl.id)}
                className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all hover:shadow-sm ${
                  active
                    ? "border-ink bg-white ring-2 ring-ink/5"
                    : "border-ink/10 bg-white/60 hover:border-ink/20"
                }`}
              >
                {/* Visual Preview container */}
                <div className="mb-3 flex items-center justify-center rounded-lg border border-ink/5 bg-slate-50/50 p-1.5">
                  {tpl.renderMini()}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-display text-sm font-bold text-ink">{tpl.name}</span>
                    {active ? (
                      <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-ink text-[10px] text-paper">
                        OK
                      </span>
                    ) : (
                      <span className="h-4.5 w-4.5 rounded-full border border-ink/25" />
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate/60">{tpl.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. COLORES DE LA LANDING */}
      <section className="rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="font-display text-xl font-bold text-ink">Colores de la landing</h2>
          <p className="text-xs text-slate/75">
            Personaliza los colores principales para botones, enlaces y acentos visuales.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 max-w-xl">
          {/* Color Primario */}
          <div className="flex flex-col gap-2 rounded-xl border border-ink/5 bg-white/50 p-4">
            <label className="text-sm font-semibold text-ink flex items-center justify-between">
              <span>Color Primario</span>
              <span className="text-xs font-mono text-slate/60">{primaryColor.toUpperCase()}</span>
            </label>
            <p className="text-[11px] text-slate/60 leading-normal mb-2">
              Se usa para el botón de llamada a acción principal (CTA), enlaces importantes y destacados.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-20 cursor-pointer rounded-lg border border-ink/10 bg-transparent p-0.5"
              />
              <button
                type="button"
                onClick={() => setPrimaryColor("#EB6517")}
                className="text-xs text-brass hover:underline"
              >
                Restablecer predeterminado
              </button>
            </div>
          </div>

          {/* Color Secundario */}
          <div className="flex flex-col gap-2 rounded-xl border border-ink/5 bg-white/50 p-4">
            <label className="text-sm font-semibold text-ink flex items-center justify-between">
              <span>Color Secundario</span>
              <span className="text-xs font-mono text-slate/60">{secondaryColor.toUpperCase()}</span>
            </label>
            <p className="text-[11px] text-slate/60 leading-normal mb-2">
              Se usa para acentos estéticos secundarios, tiras decorativas de LEDs y luces de la interfaz.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-10 w-20 cursor-pointer rounded-lg border border-ink/10 bg-transparent p-0.5"
              />
              <button
                type="button"
                onClick={() => setSecondaryColor("#F6A00C")}
                className="text-xs text-brass hover:underline"
              >
                Restablecer predeterminado
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. LOGO DE LA MARCA */}
      <section className="rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="font-display text-xl font-bold text-ink">Logo de la marca</h2>
          <p className="text-xs text-slate/75">
            Sube el logo que se usara en las cabeceras y cierres de las landings.
          </p>
        </div>

        <div className="max-w-md">
          <LogoUpload
            clientSlug={config.clientSlug}
            currentUrl={logoUrl}
            onUploaded={setLogoUrl}
          />
        </div>
      </section>

      {/* 4. ACCIONES */}
      <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 pt-6">
        <button
          type="submit"
          name="intent"
          value="preview"
          disabled={saving}
          className="rounded-full bg-ink px-8 py-3 text-sm font-bold text-paper transition hover:bg-slate disabled:opacity-60"
        >
          {saving && actionLabel === "preview" ? "Previsualizando..." : "Previsualizar diseño"}
        </button>
        <button
          type="submit"
          name="intent"
          value="confirm"
          disabled={saving}
          className="rounded-full border border-ink/20 bg-paper px-8 py-3 text-sm font-bold text-ink transition hover:border-ink/45 disabled:opacity-60"
        >
          {saving && actionLabel === "confirm" ? "Confirmando..." : "Confirmar diseño de landing"}
        </button>
        {saved ? <span className="text-xs font-semibold text-emerald-600">Cambios guardados</span> : null}
      </div>

      <section className="overflow-hidden rounded-xl border border-ink/10 bg-[#111315] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h2 className="font-display text-sm font-bold text-paper">Previsualización</h2>
          <button
            type="button"
            onClick={() => setPreviewVersion((version) => version + 1)}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-paper transition hover:border-white/35"
          >
            Actualizar
          </button>
        </div>
        <div className="bg-[#202326] p-3">
          <iframe
            key={previewSrc}
            src={previewSrc}
            title="Previsualización de landing"
            className="h-[640px] w-full rounded-lg border border-white/10 bg-white"
          />
        </div>
      </section>
    </form>
  );
}

