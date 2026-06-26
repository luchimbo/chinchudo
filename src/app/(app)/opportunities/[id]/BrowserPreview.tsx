"use client";

type BrowserPreviewProps = {
  sourceUrl: string;
  sourceAuthor: string;
  sourceText: string;
  channelName: string;
  brandName: string;
  brandBg: string;
  brandText: string;
  brandLabel: string;
  approvedText?: string;
};

const CheckIcon = () => (
  <svg className="h-3 w-3 text-blue-500 fill-current" viewBox="0 0 24 24">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
  </svg>
);

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export function BrowserPreview({
  sourceUrl,
  sourceAuthor,
  sourceText,
  channelName,
  brandName,
  brandBg,
  brandText,
  brandLabel,
  approvedText,
}: BrowserPreviewProps) {
  const channelLower = channelName.toLowerCase();
  const userInitials = (sourceAuthor || "U").slice(0, 2).toUpperCase();
  const replyText = approvedText || "";

  return (
    <div className="flex flex-col rounded-lg border border-ink/10 bg-slate-100 shadow-sm overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-ink/5 bg-slate-200 px-4 py-2.5">
        <div className="flex gap-1.5 shrink-0">
          <span className="h-3 w-3 rounded-full bg-red-400" />
          <span className="h-3 w-3 rounded-full bg-yellow-400" />
          <span className="h-3 w-3 rounded-full bg-green-400" />
        </div>
        <div className="ml-4 flex gap-2 text-slate-400 shrink-0">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div className="ml-4 flex flex-1 items-center gap-1.5 rounded bg-white px-2 py-1 text-xs text-slate-500 shadow-inner border border-slate-300 overflow-hidden">
          <svg className="h-3 w-3 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <span className="truncate">{sourceUrl}</span>
        </div>
      </div>

      {/* Viewport */}
      <div className="bg-white p-4 font-sans text-sm text-zinc-950 overflow-y-auto max-h-[420px] min-h-[200px]">
        {channelLower === "youtube" && (
          <div className="flex flex-col gap-4">
            {(() => {
              const ytid = extractYouTubeId(sourceUrl);
              if (ytid) {
                return (
                  <div className="relative w-full aspect-video rounded-md overflow-hidden bg-black shadow-sm">
                    <iframe
                      src={`https://www.youtube.com/embed/${ytid}`}
                      title="YouTube video player"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>
                );
              }
              return (
                <div className="flex aspect-video w-full items-center justify-center rounded-md bg-zinc-800 text-xs text-white">
                  [Reproductor de YouTube]
                </div>
              );
            })()}
            <div className="border-t border-zinc-100 pt-3">
              <h4 className="text-xs font-bold text-zinc-700 mb-3">Comentarios</h4>
              <div className="flex items-start gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600">
                  {userInitials}
                </span>
                <div className="flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-bold">@{sourceAuthor || "usuario"}</span>
                    <span className="text-[10px] text-zinc-500">hace 1 día</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-800 whitespace-pre-wrap">{sourceText}</p>
                  <div className="mt-1.5 flex items-center gap-3 text-zinc-400">
                    <span className="text-[10px]">👍 12</span>
                    <span className="text-[10px]">👎</span>
                    <span className="text-[10px] font-semibold">Responder</span>
                  </div>
                  {replyText ? (
                    <div className="mt-3.5 flex items-start gap-2.5 border-l-2 border-zinc-100 pl-3">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${brandBg} ${brandText}`}>
                        {brandLabel[0]}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold">@{brandLabel.toLowerCase()}</span>
                          <CheckIcon />
                          <span className="text-[10px] text-zinc-500">hace unos segundos</span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-800 whitespace-pre-wrap leading-relaxed">{replyText}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        {channelLower === "x" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600">
                {userInitials}
              </span>
              <div className="flex-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-bold text-zinc-900">{sourceAuthor || "Usuario"}</span>
                  <span className="text-[10px] text-zinc-500">@{sourceAuthor?.toLowerCase() || "usuario"} · 2h</span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-800 whitespace-pre-wrap">{sourceText}</p>
              </div>
            </div>
            {replyText ? (
              <div className="relative pl-[18px]">
                <div className="absolute top-0 bottom-0 left-[18px] w-0.5 bg-zinc-200" />
                <div className="flex items-start gap-2.5 pt-2 pl-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${brandBg} ${brandText}`}>
                    {brandLabel[0]}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-zinc-900">{brandName}</span>
                      <CheckIcon />
                      <span className="text-[10px] text-zinc-500">· 1s</span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-800 whitespace-pre-wrap leading-relaxed">{replyText}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {channelLower === "instagram" && (
          <div className="border border-zinc-200 rounded-md overflow-hidden bg-white shadow-sm max-w-sm mx-auto">
            <div className="flex items-center justify-between p-2.5 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-600 p-[1.5px] flex shrink-0">
                  <span className="h-full w-full rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-zinc-700">
                    {userInitials[0]}
                  </span>
                </span>
                <span className="text-xs font-bold">@{sourceAuthor || "usuario"}</span>
              </div>
              <span className="text-xs font-bold text-zinc-400">•••</span>
            </div>
            <div className="p-3 flex flex-col gap-2.5">
              <div className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-zinc-200 text-[8px] font-bold flex items-center justify-center shrink-0">
                  {userInitials[0]}
                </span>
                <p className="text-xs text-zinc-800 leading-normal">
                  <span className="font-bold mr-1.5">@{sourceAuthor || "usuario"}</span>
                  {sourceText}
                </p>
              </div>
              {replyText ? (
                <div className="flex items-start gap-2 ml-6 border-l border-zinc-100 pl-2">
                  <span className={`h-5 w-5 rounded-full text-[8px] font-bold flex items-center justify-center shrink-0 ${brandBg} ${brandText}`}>
                    {brandLabel[0]}
                  </span>
                  <p className="text-xs text-zinc-800 leading-normal">
                    <span className="font-bold mr-1.5">@{brandLabel.toLowerCase()}</span>
                    {replyText}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {channelLower === "facebook" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600">
                {userInitials}
              </span>
              <div>
                <div className="rounded-2xl bg-zinc-100 px-3.5 py-2 text-xs">
                  <span className="block font-bold text-zinc-950">@{sourceAuthor || "usuario"}</span>
                  <p className="mt-0.5 text-zinc-800 whitespace-pre-wrap">{sourceText}</p>
                </div>
              </div>
            </div>
            {replyText ? (
              <div className="flex items-start gap-2 ml-8 border-l-2 border-zinc-100 pl-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${brandBg} ${brandText}`}>
                  {brandLabel[0]}
                </span>
                <div className="rounded-2xl bg-zinc-100 px-3.5 py-2 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-zinc-950">{brandName}</span>
                    <CheckIcon />
                  </div>
                  <p className="mt-0.5 text-zinc-800 whitespace-pre-wrap leading-relaxed">{replyText}</p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {channelLower === "reddit" && (
          <div className="flex flex-col gap-3.5">
            <div className="flex gap-2">
              <div className="flex flex-col items-center text-zinc-400 text-xs gap-0.5 mt-0.5">
                <span>▲</span>
                <span className="font-bold text-[10px] text-zinc-700">12</span>
                <span>▼</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <span className="font-bold text-zinc-700">u/{sourceAuthor || "usuario"}</span>
                  <span>· hace 12h</span>
                </div>
                <p className="mt-1 text-xs text-zinc-800 whitespace-pre-wrap">{sourceText}</p>
                {replyText ? (
                  <div className="mt-4 flex gap-2 border-l border-dashed border-zinc-200 pl-3">
                    <div className="flex flex-col items-center text-zinc-400 text-xs gap-0.5 shrink-0 mt-0.5">
                      <span>▲</span>
                      <span className="font-bold text-[10px] text-zinc-700">1</span>
                      <span>▼</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                        <span className={`h-5 w-5 rounded-full text-[8px] font-bold flex items-center justify-center shrink-0 ${brandBg} ${brandText}`}>
                          {brandLabel[0]}
                        </span>
                        <span className="font-bold text-zinc-700">u/{brandLabel.toLowerCase()}_bot</span>
                        <span>· 1s</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-800 whitespace-pre-wrap leading-relaxed">{replyText}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {!["youtube", "x", "instagram", "facebook", "reddit"].includes(channelLower) && (
          <div className="flex flex-col gap-3">
            <div className="rounded border border-zinc-100 bg-zinc-50 p-2.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Mensaje original ({channelName})</span>
              <p className="text-xs font-bold text-zinc-700">@{sourceAuthor}</p>
              <p className="mt-1 text-xs text-zinc-800 whitespace-pre-wrap">{sourceText}</p>
            </div>
            {replyText ? (
              <div className="rounded border border-zinc-200 bg-white p-3 shadow-sm border-l-4 border-l-zinc-700">
                <div className="flex items-center gap-1">
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${brandBg} ${brandText}`}>
                    {brandLabel[0]}
                  </span>
                  <span className="text-xs font-bold">{brandName}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-800 whitespace-pre-wrap">{replyText}</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
