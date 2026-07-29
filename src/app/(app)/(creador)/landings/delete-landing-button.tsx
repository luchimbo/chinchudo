"use client";

export function DeleteLandingButton({
  id,
  action,
}: {
  id: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("¿Eliminar esta landing? Esta acción no se puede deshacer.")) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="rounded-lg border border-signal/60 px-3 py-1.5 text-xs font-semibold text-signal transition hover:bg-signal/10">
        Eliminar landing
      </button>
    </form>
  );
}
