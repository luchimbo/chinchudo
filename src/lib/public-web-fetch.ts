import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { privateStoreAddress } from "./tiendanube-public";
import { withAbortSignal } from "./abortable";
export { withAbortSignal } from "./abortable";

/** Validate every redirect and pin the DNS answer to the socket (no rebinding). */
export type PublicTextResult = { url: URL; html: string; truncated?: boolean };
export async function fetchPublicText(input: URL, signal: AbortSignal, redirects = 0, options: { allowPartial?: boolean } = {}): Promise<PublicTextResult> {
  if (!/^https?:$/.test(input.protocol) || input.username || input.password || input.port && !["80", "443"].includes(input.port) || input.hostname === "localhost" || input.hostname.endsWith(".local")) throw new Error("La URL no es pública.");
  const addresses = await withAbortSignal(lookup(input.hostname.replace(/^\[|\]$/g, ""), { all: true }), signal);
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(a => privateStoreAddress(a.address))) throw new Error("No se permiten direcciones internas.");
  return new Promise((resolve, reject) => {
    const request = (input.protocol === "https:" ? httpsRequest : httpRequest)(input, {
      signal,
      lookup: ((_host: string, options: { all?: boolean }, callback: Function) => options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family)) as import("node:net").LookupFunction,
      headers: { "User-Agent": "Cafishia-OnboardingBot/1.0", Accept: "text/html,text/plain,application/xhtml+xml,application/xml,text/xml" },
    }, response => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        if (redirects >= 4 || !response.headers.location) { reject(new Error("Demasiadas redirecciones.")); return; }
        void fetchPublicText(new URL(response.headers.location, input), signal, redirects + 1, options).then(resolve, reject); return;
      }
      if (status < 200 || status >= 300) { response.resume(); reject(new Error(`El sitio respondió ${status}.`)); return; }
      if (!/text\/(html|xml|plain)|application\/(xhtml\+xml|xml)/i.test(String(response.headers["content-type"] || ""))) { response.resume(); reject(new Error("La URL no contiene una página HTML.")); return; }
      const chunks: Buffer[] = []; let size = 0; let finished = false;
      response.on("data", (chunk: Buffer) => {
        if (finished) return;
        if (size + chunk.length > 2_000_000) {
          if (!options.allowPartial) { response.destroy(new Error("La página es demasiado grande.")); return; }
          chunks.push(chunk.subarray(0, 2_000_000 - size));
          finished = true;
          resolve({ url: input, html: Buffer.concat(chunks).toString("utf8"), truncated: true });
          response.destroy();
          return;
        }
        size += chunk.length;
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("aborted", () => { if (!finished) reject(new Error("La lectura de la página se interrumpió.")); });
      response.on("end", () => { if (!finished) resolve({ url: input, html: Buffer.concat(chunks).toString("utf8") }); });
    });
    request.on("error", reject); request.end();
  });
}
