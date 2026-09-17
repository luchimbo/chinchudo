import { describe, expect, it, vi } from "vitest";
import { authorFromUrl, formatAuthor, resolveSourceAuthor } from "../source-author";

describe("authorFromUrl", () => {
  it("toma el @handle de TikTok", () => {
    expect(authorFromUrl("TikTok", "https://www.tiktok.com/@_pineapplemusic/video/7462190100869418246")?.name).toBe("@_pineapplemusic");
  });

  it("toma el usuario de Instagram solo si está en la URL", () => {
    expect(authorFromUrl("Instagram", "https://www.instagram.com/arturia_entuidioma/p/DajI-1HoN3Q/")?.name).toBe("@arturia_entuidioma");
    expect(authorFromUrl("Instagram", "https://www.instagram.com/p/CkQ4Pq7raub/")).toBeNull();
  });

  it("reconoce canales de YouTube pero no videos sueltos", () => {
    expect(authorFromUrl("YouTube", "https://www.youtube.com/c/StudioMusiccl/shorts")?.name).toBe("StudioMusiccl");
    expect(authorFromUrl("YouTube", "https://www.youtube.com/@ColdmanBeats/videos")?.handle).toBe("@ColdmanBeats");
    expect(authorFromUrl("YouTube", "https://m.youtube.com/watch?v=tQ5qemuHc8Q")).toBeNull();
  });

  it("resuelve X, LinkedIn y páginas de Facebook", () => {
    expect(authorFromUrl("X", "https://x.com/oprimodev/status/1948724549681295569")?.name).toBe("@oprimodev");
    expect(authorFromUrl("Linkedin", "https://ar.linkedin.com/in/gonzalo-peralta-384908345")?.name).toBe("Gonzalo Peralta");
    expect(authorFromUrl("Linkedin", "https://es.linkedin.com/posts/daniel-avila-arias_en-claude-code-activity-7439428539629604864-wYY9")?.name).toBe("Daniel Avila Arias");
    expect(authorFromUrl("Facebook", "https://m.facebook.com/xprostore.argentina/photos/a.1/2/")?.name).toBe("xprostore.argentina");
    expect(authorFromUrl("Facebook", "https://www.facebook.com/100083342568606/posts/abc/1/")).toBeNull();
    expect(authorFromUrl("Facebook", "https://www.facebook.com/groups/170250986411828/posts/1/")).toBeNull();
  });
});

describe("resolveSourceAuthor", () => {
  const jsonResponse = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

  it("usa oEmbed para videos de YouTube", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({ author_name: "Coldman Beats", author_url: "https://www.youtube.com/@ColdmanBeats" }));
    const author = await resolveSourceAuthor("YouTube", "https://www.youtube.com/watch?v=2PH34XdeOZc", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(author).toEqual({ name: "Coldman Beats", handle: "@ColdmanBeats", profileUrl: "https://www.youtube.com/@ColdmanBeats" });
  });

  it("lee el canal de la página cuando el video no permite oEmbed", async () => {
    const html = '<script>var x={"ownerProfileUrl":"http://www.youtube.com/@mourglia","ownerChannelName":"Leonardo Mourglia \\u0026 Co"}</script>';
    const fetchImpl = vi.fn((url: string) => url.includes("/oembed")
      ? Promise.resolve(new Response("Unauthorized", { status: 401 }))
      : Promise.resolve(new Response(html, { status: 200 })));
    const author = await resolveSourceAuthor("YouTube", "https://www.youtube.com/watch?v=JcTQED6dVeg", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(author).toEqual({ name: "Leonardo Mourglia & Co", handle: "@mourglia", profileUrl: "https://www.youtube.com/@mourglia" });
  });

  it("usa el JSON público de Reddit e ignora borrados", async () => {
    const listing = (author: string) => [{ data: { children: [{ data: { author } }] } }];
    const ok = vi.fn(() => jsonResponse(listing("beatmaker")));
    expect((await resolveSourceAuthor("Reddit", "https://www.reddit.com/r/ableton/comments/15qruun/x/", { fetchImpl: ok as unknown as typeof fetch }))?.name).toBe("u/beatmaker");
    const deleted = vi.fn(() => jsonResponse(listing("[deleted]")));
    expect(await resolveSourceAuthor("Reddit", "https://www.reddit.com/r/ableton/comments/15qruun/x/", { fetchImpl: deleted as unknown as typeof fetch })).toBeNull();
  });

  it("no lanza si la red falla", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("offline")));
    expect(await resolveSourceAuthor("YouTube", "https://www.youtube.com/watch?v=x", { fetchImpl: failing as unknown as typeof fetch })).toBeNull();
  });
});

describe("formatAuthor", () => {
  it("separa nombre y handle", () => {
    expect(formatAuthor("@freddya.o.albornoz4734", "YouTube", "https://www.youtube.com/watch?v=n&lc=1")).toEqual({
      name: "freddya.o.albornoz4734",
      handle: "@freddya.o.albornoz4734",
      profileUrl: "https://www.youtube.com/@freddya.o.albornoz4734",
      initial: "F",
    });
    expect(formatAuthor("u/beatmaker", "Reddit", "https://www.reddit.com/r/a/comments/1/x/")?.profileUrl).toBe("https://www.reddit.com/user/beatmaker");
  });

  it("completa desde la URL cuando no hay autor guardado", () => {
    expect(formatAuthor("", "TikTok", "https://www.tiktok.com/@agustorrente/video/1")?.name).toBe("agustorrente");
    expect(formatAuthor("", "Instagram", "https://www.instagram.com/p/CkQ4Pq7raub/")).toBeNull();
  });

  it("mantiene nombres de canal tal cual", () => {
    const author = formatAuthor("Coldman Beats", "YouTube", "https://www.youtube.com/watch?v=1");
    expect(author).toMatchObject({ name: "Coldman Beats", handle: "", initial: "C" });
  });
});

describe("communityFromUrl", () => {
  it("devuelve el subreddit", async () => {
    const { communityFromUrl } = await import("../source-author");
    expect(communityFromUrl("https://www.reddit.com/r/ableton/comments/15qruun/x/")).toBe("r/ableton");
    expect(communityFromUrl("https://www.tiktok.com/@a/video/1")).toBe("");
  });
});

describe("checkYouTubeAvailability", () => {
  const responder = (oembedStatus: number, page = "") => vi.fn((url: string) => Promise.resolve(
    url.includes("/oembed") ? new Response("", { status: oembedStatus }) : new Response(page, { status: 200 }),
  ));
  const check = async (fetchImpl: ReturnType<typeof responder>, url = "https://www.youtube.com/watch?v=abc&lc=Ugx") => {
    const { checkYouTubeAvailability } = await import("../source-author");
    return checkYouTubeAvailability(url, { fetchImpl: fetchImpl as unknown as typeof fetch });
  };

  it("usa oEmbed para distinguir privados y eliminados", async () => {
    expect(await check(responder(200))).toBe("available");
    expect(await check(responder(401))).toBe("available");
    expect(await check(responder(403))).toBe("private");
    expect(await check(responder(404))).toBe("removed");
  });

  it("si oEmbed no responde lee la página del video", async () => {
    expect(await check(responder(500, '{"playabilityStatus":{"status":"LOGIN_REQUIRED","reason":"Video privado"}}'))).toBe("private");
    expect(await check(responder(500, '{"playabilityStatus":{"status":"ERROR","reason":"Este video no est\u00e1 disponible."}}'))).toBe("removed");
    expect(await check(responder(500, '{"playabilityStatus":{"status":"LOGIN_REQUIRED","reason":"Confirma tu edad"}}'))).toBe("available");
  });

  it("no descarta ante dudas", async () => {
    expect(await check(responder(429, "<html>sorry</html>"))).toBe("unknown");
    expect(await check(responder(200), "https://www.youtube.com/@canal")).toBe("unknown");
  });

  it("reconoce ids de shorts y youtu.be", async () => {
    const { youtubeVideoId } = await import("../source-author");
    expect(youtubeVideoId("https://m.youtube.com/shorts/8FnKwBOjQzo")).toBe("8FnKwBOjQzo");
    expect(youtubeVideoId("https://youtu.be/2PH34XdeOZc")).toBe("2PH34XdeOZc");
  });
});
