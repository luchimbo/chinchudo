/** Solo identifica procedencias que el navegador envió; no mide citas de IA. */
export function blogReferral(referrer: string | null): string {
  let host: string;
  try { host = new URL(referrer || "").hostname.toLowerCase(); } catch { return "Sin referencia identificable"; }
  const at = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (/^(?:www\.)?google\.[a-z.]+$/.test(host)) return "Google";
  if (at("bing.com")) return "Bing";
  if (at("search.yahoo.com")) return "Yahoo";
  if (at("duckduckgo.com")) return "DuckDuckGo";
  if (at("chatgpt.com") || at("chat.openai.com")) return "ChatGPT";
  if (at("perplexity.ai")) return "Perplexity";
  if (at("gemini.google.com")) return "Gemini";
  if (at("claude.ai")) return "Claude";
  if (at("copilot.microsoft.com")) return "Copilot";
  return "Otras referencias";
}
