"use client";

import React, { useState } from "react";
import { SubmitButton } from "./SubmitButton";

type ResponseEntry = {
  id: string;
  variantType: string;
  draftText: string;
  editedText: string;
  riskNotes: string;
  approvedBy: string;
  brand: { name: string };
  persona: { name: string };
};

type OpportunityEntry = {
  id: string;
  sourceUrl: string;
  sourceAuthor: string;
  sourceText: string;
  channel: { name: string };
};

type DraftCardProps = {
  response: ResponseEntry;
  opportunity: OpportunityEntry;
  clientSlug?: string | null;
  approveResponseAction: (formData: FormData) => Promise<void>;
};

function getPersonaDisplayName(name: string, clientSlug?: string | null) {
  if (clientSlug === "prestige-running") {
    if (name === "Baterista de Departamento") return "El Corredor";
    if (name === "Técnico / Productor") return "Kinesiólogo";
    if (name === "Trend-Setter Kressmer") return "Trend Setter";
    if (name === "Profe / Madre-Padre") return "Escolar / Padres";
  }
  if (name === "Trend-Setter Kressmer") return "Trend Setter";
  if (name === "Profe / Madre-Padre") return "Profe de Música";
  return name;
}

// Helper to extract YouTube Video ID
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Brand color palette helper
function getBrandAvatarStyles(brandName: string) {
  const nameLower = brandName.toLowerCase();
  if (nameLower.includes("midiplus")) {
    return { bg: "bg-moss", text: "text-white", label: "MidiPlus" };
  } else if (nameLower.includes("kressmer")) {
    return { bg: "bg-brass", text: "text-white", label: "Kressmer" };
  } else if (nameLower.includes("prestige")) {
    return { bg: "bg-ink", text: "text-paper", label: "Prestige" };
  }
  return { bg: "bg-slate-700", text: "text-white", label: brandName.slice(0, 2) };
}

export function DraftCard({ response, opportunity, clientSlug, approveResponseAction }: DraftCardProps) {
  const [text, setText] = useState(response.editedText || response.draftText);
  const [isCopied, setIsCopied] = useState(false);

  const brandStyle = getBrandAvatarStyles(response.brand.name);
  const userInitials = (opportunity.sourceAuthor || "U").slice(0, 2).toUpperCase();
  const channelLower = opportunity.channel.name.toLowerCase();

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // SVGs for social media mockups
  const CheckIcon = () => (
    <svg className="h-3 w-3 text-blue-500 fill-current" viewBox="0 0 24 24">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
    </svg>
  );

  return (
    <article className="rounded-lg border border-ink/10 bg-white/75 p-5 shadow-panel backdrop-blur transition-all duration-300 hover:shadow-md">
      {/* Header Info */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/5 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate/60">
            {response.variantType} / {getPersonaDisplayName(response.persona.name, clientSlug)}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${brandStyle.bg} ${brandStyle.text}`}>
              {brandStyle.label[0]}
            </span>
            <span className="text-sm font-bold text-ink">{response.brand.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-full border border-ink/15 bg-white/80 px-3.5 py-1 text-xs font-bold text-ink transition hover:border-ink/40 hover:bg-white"
          >
            {isCopied ? "¡Copiado!" : "Copiar"}
          </button>
          {response.approvedBy ? (
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-moss px-3 py-1 text-xs font-bold text-white shadow-sm">
                ✓ Aprobada
              </span>
              <a
                href="#publish-section"
                className="rounded-full border border-brass/35 bg-brass/10 hover:bg-brass hover:text-white transition px-3 py-1 text-xs font-bold text-brass shadow-sm"
              >
                Ir a publicar →
              </a>
            </div>
          ) : null}
        </div>
      </div>

      {/* Split Layout: Editor on left, Browser Sandbox on right */}
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Left Side: Editor Form */}
        <form action={approveResponseAction} className="flex flex-col justify-between gap-4">
          <input type="hidden" name="responseId" value={response.id} />
          <input type="hidden" name="opportunityId" value={opportunity.id} />
          <input type="hidden" name="approvedBy" value="Fede" />

          <div className="flex flex-1 flex-col">
            <label className="mb-1 text-xs font-bold uppercase tracking-wider text-slate/50">
              Contenido del Borrador
            </label>
            <textarea
              name="editedText"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full flex-1 resize-y rounded-md border border-ink/15 bg-white px-4 py-3 text-sm leading-relaxed text-ink focus:border-ink/40 focus:ring-1 focus:ring-ink/20 focus:outline-none"
              placeholder="Escribe la respuesta aquí..."
            />
          </div>

          {response.riskNotes ? (
            <details className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-800 transition-colors">
              <summary className="cursor-pointer font-bold text-amber-700 hover:text-amber-900 focus:outline-none">
                Ver advertencias y notas internas
              </summary>
              <p className="mt-2 leading-relaxed">{response.riskNotes}</p>
            </details>
          ) : null}

          <div className="flex justify-end gap-2 pt-2 border-t border-ink/5">
            <SubmitButton
              loadingText={response.approvedBy ? "Actualizando…" : "Aprobando…"}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-paper transition hover:bg-slate-850 disabled:opacity-50"
            >
              {response.approvedBy ? "Actualizar texto aprobado" : "Aprobar texto"}
            </SubmitButton>
          </div>
        </form>

        {/* Right Side: Simulated Browser Window */}
        <div className="flex flex-col rounded-lg border border-ink/10 bg-slate-100 shadow-sm overflow-hidden">
          {/* Browser Top Window Bar */}
          <div className="flex items-center gap-2 border-b border-ink/5 bg-slate-200 px-4 py-2.5">
            {/* window close, minimize, maximize buttons */}
            <div className="flex gap-1.5 shrink-0">
              <span className="h-3 w-3 rounded-full bg-red-400"></span>
              <span className="h-3 w-3 rounded-full bg-yellow-400"></span>
              <span className="h-3 w-3 rounded-full bg-green-400"></span>
            </div>

            {/* Back, Forward, Refresh icons */}
            <div className="ml-4 flex gap-2 text-slate-400 shrink-0">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 12H19" />
              </svg>
            </div>

            {/* Address Bar */}
            <div className="ml-4 flex flex-1 items-center gap-1.5 rounded bg-white px-2 py-1 text-xs text-slate-500 shadow-inner border border-slate-300 overflow-hidden">
              {/* Lock icon */}
              <svg className="h-3 w-3 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span className="truncate">{opportunity.sourceUrl}</span>
            </div>
          </div>

          {/* Browser Viewport Content */}
          <div className="flex-1 bg-white p-4 font-sans text-sm text-zinc-950 overflow-y-auto max-h-[380px] min-h-[300px]">
            
            {/* Render dynamically based on channel */}
            {channelLower === "youtube" && (
              <div className="flex flex-col gap-4">
                {/* Real YouTube Video Embed */}
                {(() => {
                  const ytid = extractYouTubeId(opportunity.sourceUrl);
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

                {/* Comment Section Mockup */}
                <div className="border-t border-zinc-100 pt-3">
                  <h4 className="text-xs font-bold text-zinc-700 mb-3">Comentarios</h4>
                  
                  {/* User Comment */}
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600">
                      {userInitials}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs font-bold">@{opportunity.sourceAuthor || "usuario"}</span>
                        <span className="text-[10px] text-zinc-500">hace 1 día</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-800 whitespace-pre-wrap">{opportunity.sourceText}</p>
                      
                      <div className="mt-1.5 flex items-center gap-3 text-zinc-400">
                        {/* thumbs up */}
                        <span className="text-[10px] hover:text-zinc-600 cursor-pointer">👍 12</span>
                        <span className="text-[10px] hover:text-zinc-600 cursor-pointer">👎</span>
                        <span className="text-[10px] hover:text-zinc-600 cursor-pointer font-semibold">Responder</span>
                      </div>

                      {/* Brand Reply (Live Preview) */}
                      <div className="mt-3.5 flex items-start gap-2.5 border-l-2 border-zinc-100 pl-3">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${brandStyle.bg} ${brandStyle.text}`}>
                          {brandStyle.label[0]}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold">@{brandStyle.label.toLowerCase()}</span>
                            <CheckIcon />
                            <span className="text-[10px] text-zinc-500">hace unos segundos</span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-800 whitespace-pre-wrap leading-relaxed">
                            {text || <span className="italic text-zinc-400">[Escribe tu respuesta...]</span>}
                          </p>
                          <div className="mt-1.5 flex items-center gap-3 text-zinc-400">
                            <span className="text-[10px]">👍</span>
                            <span className="text-[10px]">👎</span>
                            <span className="text-[10px] font-semibold">Responder</span>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            )}

            {channelLower === "x" && (
              <div className="flex flex-col gap-3 font-serif">
                {/* Tweet Header / Original Post */}
                <div className="flex items-start gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600">
                    {userInitials}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-1">
                      <span className="font-sans text-xs font-bold text-zinc-900">{opportunity.sourceAuthor || "Usuario"}</span>
                      <span className="font-sans text-[10px] text-zinc-500">@{opportunity.sourceAuthor?.toLowerCase() || "usuario"}</span>
                      <span className="font-sans text-[10px] text-zinc-500">· 2h</span>
                    </div>
                    <p className="font-sans mt-0.5 text-xs text-zinc-800 whitespace-pre-wrap">{opportunity.sourceText}</p>
                  </div>
                </div>

                {/* Connecting Thread Line */}
                <div className="relative pl-[18px]">
                  <div className="absolute top-0 bottom-0 left-[18px] w-0.5 bg-zinc-200"></div>
                  
                  {/* Reply Post (Live Preview) */}
                  <div className="flex items-start gap-2.5 pt-2 pl-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${brandStyle.bg} ${brandStyle.text}`}>
                      {brandStyle.label[0]}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-1">
                        <span className="font-sans text-xs font-bold text-zinc-900">{response.brand.name}</span>
                        <CheckIcon />
                        <span className="font-sans text-[10px] text-zinc-500">@{brandStyle.label.toLowerCase()}_oficial</span>
                        <span className="font-sans text-[10px] text-zinc-500">· 1s</span>
                      </div>
                      <p className="font-sans mt-0.5 text-xs text-zinc-800 whitespace-pre-wrap leading-relaxed">
                        {text || <span className="italic text-zinc-400">[Escribe tu respuesta...]</span>}
                      </p>

                      {/* X Tweet Stats & Action Buttons */}
                      <div className="mt-3 flex items-center justify-between max-w-xs text-zinc-400 border-t border-zinc-100 pt-2 font-sans text-[10px]">
                        <span className="flex items-center gap-1 hover:text-blue-500 cursor-pointer">💬 0</span>
                        <span className="flex items-center gap-1 hover:text-emerald-500 cursor-pointer">🔁 0</span>
                        <span className="flex items-center gap-1 hover:text-rose-500 cursor-pointer">❤️ 0</span>
                        <span className="flex items-center gap-1 hover:text-blue-500 cursor-pointer">📊 1</span>
                        <span className="hover:text-blue-500 cursor-pointer">🔖</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {channelLower === "instagram" && (
              <div className="border border-zinc-200 rounded-md overflow-hidden bg-white shadow-sm max-w-sm mx-auto">
                {/* IG Post Header */}
                <div className="flex items-center justify-between p-2.5 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-600 p-[1.5px] flex shrink-0">
                      <span className="h-full w-full rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-zinc-700">
                        {userInitials[0]}
                      </span>
                    </span>
                    <span className="text-xs font-bold">@{opportunity.sourceAuthor || "usuario"}</span>
                  </div>
                  <span className="text-xs font-bold text-zinc-400">•••</span>
                </div>

                {/* IG Post Media Faux */}
                <div className="aspect-square bg-zinc-50 border-b border-zinc-100 flex flex-col items-center justify-center text-zinc-400 p-4">
                  <svg className="h-8 w-8 text-zinc-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-[10px] text-center max-w-[200px] leading-relaxed truncate">{opportunity.sourceText}</p>
                </div>

                {/* IG Comments Section */}
                <div className="p-3 flex flex-col gap-2.5 max-h-[180px] overflow-y-auto bg-white border-t border-zinc-50">
                  {/* Original Comment */}
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex gap-2">
                      <span className="h-5 w-5 rounded-full bg-zinc-200 text-[8px] font-bold flex items-center justify-center shrink-0">
                        {userInitials[0]}
                      </span>
                      <p className="text-xs text-zinc-800 leading-normal">
                        <span className="font-bold mr-1.5">@{opportunity.sourceAuthor || "usuario"}</span>
                        {opportunity.sourceText}
                      </p>
                    </div>
                    <span className="text-[10px] text-zinc-400 cursor-pointer">♡</span>
                  </div>

                  {/* Brand Reply (Live Preview) */}
                  <div className="flex items-start justify-between gap-1 ml-6 border-l border-zinc-100 pl-2">
                    <div className="flex gap-2">
                      <span className={`h-5 w-5 rounded-full text-[8px] font-bold flex items-center justify-center shrink-0 ${brandStyle.bg} ${brandStyle.text}`}>
                        {brandStyle.label[0]}
                      </span>
                      <div>
                        <p className="text-xs text-zinc-800 leading-normal">
                          <span className="font-bold mr-1.5">@{brandStyle.label.toLowerCase()}</span>
                          {text || <span className="italic text-zinc-400">[Escribe tu respuesta...]</span>}
                        </p>
                        <div className="mt-1 flex items-center gap-2.5 text-[9px] text-zinc-400">
                          <span>1 s</span>
                          <span className="font-bold cursor-pointer">Responder</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-400 cursor-pointer">♡</span>
                  </div>
                </div>
              </div>
            )}

            {channelLower === "facebook" && (
              <div className="flex flex-col gap-3 font-sans">
                {/* User Comment Bubble */}
                <div className="flex items-start gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600">
                    {userInitials}
                  </span>
                  <div>
                    <div className="rounded-2xl bg-zinc-100 px-3.5 py-2 text-xs">
                      <span className="block font-bold text-zinc-950">@{opportunity.sourceAuthor || "usuario"}</span>
                      <p className="mt-0.5 text-zinc-800 whitespace-pre-wrap">{opportunity.sourceText}</p>
                    </div>
                    <div className="mt-1 ml-2 flex items-center gap-3 text-[10px] font-bold text-zinc-500">
                      <span className="hover:underline cursor-pointer">Me gusta</span>
                      <span className="hover:underline cursor-pointer">Responder</span>
                      <span>1 d</span>
                    </div>
                  </div>
                </div>

                {/* Reply Bubble (Live Preview) */}
                <div className="flex items-start gap-2 ml-8 border-l-2 border-zinc-100 pl-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${brandStyle.bg} ${brandStyle.text}`}>
                    {brandStyle.label[0]}
                  </span>
                  <div>
                    <div className="rounded-2xl bg-zinc-100 px-3.5 py-2 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-zinc-950">{response.brand.name}</span>
                        <CheckIcon />
                      </div>
                      <p className="mt-0.5 text-zinc-800 whitespace-pre-wrap leading-relaxed">
                        {text || <span className="italic text-zinc-400">[Escribe tu respuesta...]</span>}
                      </p>
                    </div>
                    <div className="mt-1 ml-2 flex items-center gap-3 text-[10px] font-bold text-zinc-500">
                      <span className="hover:underline cursor-pointer text-blue-600">Me gusta</span>
                      <span className="hover:underline cursor-pointer">Responder</span>
                      <span>1 s</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {channelLower === "reddit" && (
              <div className="flex flex-col gap-3.5">
                {/* Reddit Original Post */}
                <div className="flex gap-2">
                  {/* Upvote score sidebar */}
                  <div className="flex flex-col items-center text-zinc-400 text-xs gap-0.5 mt-0.5">
                    <span className="hover:text-orange-500 cursor-pointer">▲</span>
                    <span className="font-bold text-[10px] text-zinc-700">12</span>
                    <span className="hover:text-blue-500 cursor-pointer">▼</span>
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                      <span className="font-bold text-zinc-700">u/{opportunity.sourceAuthor || "usuario"}</span>
                      <span>· hace 12h</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-800 whitespace-pre-wrap">{opportunity.sourceText}</p>
                    
                    <div className="mt-2 flex items-center gap-3 text-[10px] font-bold text-zinc-400">
                      <span className="hover:text-zinc-600 cursor-pointer">💬 4 Replies</span>
                      <span className="hover:text-zinc-600 cursor-pointer">Share</span>
                      <span className="hover:text-zinc-600 cursor-pointer">Award</span>
                    </div>

                    {/* Reddit Reply (Live Preview) */}
                    <div className="mt-4 flex gap-2 border-l border-dashed border-zinc-200 pl-3">
                      {/* Upvote reply */}
                      <div className="flex flex-col items-center text-zinc-400 text-xs gap-0.5 shrink-0 mt-0.5">
                        <span className="hover:text-orange-500 cursor-pointer">▲</span>
                        <span className="font-bold text-[10px] text-zinc-700">1</span>
                        <span className="hover:text-blue-500 cursor-pointer">▼</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                          <span className={`h-5 w-5 rounded-full text-[8px] font-bold flex items-center justify-center shrink-0 ${brandStyle.bg} ${brandStyle.text}`}>
                            {brandStyle.label[0]}
                          </span>
                          <span className="font-bold text-zinc-700">u/{brandStyle.label.toLowerCase()}_bot</span>
                          <span className="bg-blue-50 text-blue-600 px-1 rounded text-[8px] font-bold">OP</span>
                          <span>· 1s</span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-800 whitespace-pre-wrap leading-relaxed">
                          {text || <span className="italic text-zinc-400">[Escribe tu respuesta...]</span>}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-[10px] font-bold text-zinc-400">
                          <span className="hover:text-zinc-600 cursor-pointer">Reply</span>
                          <span className="hover:text-zinc-600 cursor-pointer">Share</span>
                          <span className="hover:text-zinc-600 cursor-pointer">Save</span>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            )}

            {/* Fallback channel preview */}
            {channelLower !== "youtube" && channelLower !== "x" && channelLower !== "instagram" && channelLower !== "facebook" && channelLower !== "reddit" && (
              <div className="flex flex-col gap-3">
                <div className="rounded border border-zinc-100 bg-zinc-50 p-2.5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Mensaje original ({opportunity.channel.name})</span>
                  <p className="text-xs font-bold text-zinc-700">@{opportunity.sourceAuthor}</p>
                  <p className="mt-1 text-xs text-zinc-800 whitespace-pre-wrap">{opportunity.sourceText}</p>
                </div>
                
                <div className="rounded border border-zinc-200 bg-white p-3 shadow-sm border-l-4 border-l-zinc-700">
                  <div className="flex items-center gap-1">
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${brandStyle.bg} ${brandStyle.text}`}>
                      {brandStyle.label[0]}
                    </span>
                    <span className="text-xs font-bold">{response.brand.name}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-800 whitespace-pre-wrap">
                    {text || <span className="italic text-zinc-400">[Escribe tu respuesta...]</span>}
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </article>
  );
}
