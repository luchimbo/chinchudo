import { FirstUseHint } from "@/components/first-use-hint";
import { requirePageClient } from "@/lib/auth";
import { prisma } from "@/lib/db";
import OptimizedCopilot from "./optimized-page";

type PageProps = {
  searchParams: { firstUse?: string; client?: string; brand?: string; channel?: string; language?: string; response?: string; sort?: string; page?: string; focus?: string; youtubeConnected?: string; youtubeError?: string };
};

const YOUTUBE_ERRORS: Record<string, string> = {
  access_denied: "Cancelaste el permiso en Google. Volvé a conectar y aceptá el acceso para publicar.",
  youtube_refresh_token_missing: "Google no entregó un permiso permanente. Quitá el acceso de esta app en tu cuenta de Google y volvé a conectar.",
  invalid_state: "La conexión venció o se abrió en otra pestaña. Volvé a intentarlo desde acá.",
};

function YouTubeConnectionNotice({ connected, error }: { connected?: string; error?: string }) {
  if (connected) return <p role="status" className="mx-5 mt-4 rounded-lg bg-moss/10 px-4 py-3 text-sm text-moss lg:mx-8">Cuenta de YouTube conectada. Ya podés publicar respuestas.</p>;
  if (!error) return null;
  const message = YOUTUBE_ERRORS[error] ?? `No se pudo conectar YouTube (${error}). Volvé a intentarlo.`;
  return <p role="alert" className="mx-5 mt-4 rounded-lg bg-signal/10 px-4 py-3 text-sm text-signal lg:mx-8">{message}</p>;
}

export default async function CopilotoPage({ searchParams }: PageProps) {
  const firstUse = searchParams.firstUse === "opportunities" || searchParams.firstUse === "responses" ? searchParams.firstUse : null;
  const client = firstUse ? await requirePageClient(prisma, searchParams.client) : null;
  return (
    <>
      <YouTubeConnectionNotice connected={searchParams.youtubeConnected} error={searchParams.youtubeError} />
      {firstUse && client ? <FirstUseHint goal={firstUse} clientSlug={client.slug} clientId={client.id} /> : null}
      <OptimizedCopilot searchParams={searchParams} />
    </>
  );
}
