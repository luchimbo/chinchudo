"use client";

export const BRIEF_MAX_LENGTH = 500;

/** Consigna libre del operador para orientar el artículo. */
export function BriefField({ value, onChange, name = "brief" }: { value?: string; onChange?: (value: string) => void; name?: string }) {
  const length = value?.length ?? 0;
  return <label className="block text-sm font-medium text-ink">Tema o consigna <span className="font-normal text-slate">(opcional)</span>
    <textarea name={name} rows={3} maxLength={BRIEF_MAX_LENGTH} {...(onChange ? { value, onChange: event => onChange(event.target.value) } : {})}
      placeholder="Ej.: Cómo elegir un controlador MIDI para producir en el celular, para alguien que recién empieza."
      className="mt-1 block w-full resize-y rounded-lg border border-ink/20 bg-paper px-3 py-2 font-normal" />
    <span className="mt-1 block text-xs font-normal text-slate">Si lo dejás vacío, el tema se elige automáticamente.{onChange ? ` ${length}/${BRIEF_MAX_LENGTH}` : ""}</span>
  </label>;
}
