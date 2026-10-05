import { describe,it,expect,vi } from "vitest";
import { gzipSync } from "node:zlib";
import { createStoreReader,parseStorePage,parseSitemap,robotsAllows,privateStoreAddress } from "./tiendanube-public";

const url="https://shop.example/productos/teclado/";
const main={"@type":"Product","@id":url,name:"Teclado Arturia",brand:{name:"Arturia"},sku:"A1",description:"25 teclas",offers:{url,price:"100",priceCurrency:"ARS",availability:"https://schema.org/OutOfStock"}};
const html=`<link rel="canonical" href="${url}"><h1>Teclado Arturia</h1><div data-store="product-detail" data-product-id="123" data-variants='[{"product_id":123,"sku":"A1"}]'></div><div data-product-id="999" data-store="product-item-999"></div><script type="application/ld+json">${JSON.stringify({"@type":"WebPage",mainEntity:main})}</script><script type="application/ld+json">${JSON.stringify({...main,"@id":"https://shop.example/productos/otro/",name:"Recomendado",offers:{url:"https://shop.example/productos/otro/"}})}</script>`;
describe("lector público de Tiendanube",()=>{
  it("elige la ficha principal e ignora recomendaciones; falta de stock conserva identidad",()=>{
    expect(parseStorePage(html,url)).toMatchObject({id:"123",name:"Teclado Arturia",sku:"A1",availability:"https://schema.org/OutOfStock",price:"100"});
  });
  it("no acepta el producto recomendado si falta el principal",()=>expect(parseStorePage(html.replace(JSON.stringify({"@type":"WebPage",mainEntity:main}),"{}"),url)).toBeNull());
  it("extrae la identidad de categoría sin ejecutar JavaScript",()=>expect(parseStorePage(`<h1>Controladores</h1><script>LS.category = {id : 456, name:'Controladores'};evil()</script>`,"https://shop.example/controladores/")).toMatchObject({kind:"category",id:"456"}));
  it("admite índices y listados, rechaza HTML de error",()=>{
    expect(parseSitemap(`<sitemapindex><sitemap><loc>/a.xml.gz</loc></sitemap></sitemapindex>`,url).indexes).toEqual(["https://shop.example/a.xml.gz"]);
    expect(()=>parseSitemap("<html>Error</html>",url)).toThrow();
  });
  it("respeta grupos y excepciones de robots",()=>{
    const rules="User-agent: *\nDisallow: /admin/\nDisallow: /*?view=\nAllow: /admin/public/\n\nUser-agent: OtherBot\nDisallow: /";
    expect(robotsAllows(rules,"/productos/a/")).toBe(true);expect(robotsAllows(rules,"/admin/private/")).toBe(false);expect(robotsAllows(rules,"/admin/public/a")).toBe(true);expect(robotsAllows(rules,"/p?view=x")).toBe(false);
  });
  it.each(["127.0.0.1","10.0.0.1","169.254.169.254","::1","::ffff:127.0.0.1","::ffff:7f00:1","fe80::1"])("bloquea direcciones internas %s",address=>expect(privateStoreAddress(address)).toBe(true));
  it("lee un sitemap gzip y sigue su índice",async()=>{
    const fetcher=vi.fn(async(input:any)=>input.endsWith("robots.txt")?new Response("User-agent: *\nSitemap: https://shop.example/index.xml"):input.endsWith("index.xml")?new Response("<sitemapindex><sitemap><loc>https://shop.example/catalog.xml.gz</loc></sitemap></sitemapindex>"):new Response(gzipSync(`<urlset><url><loc>${url}</loc></url></urlset>`)));
    const reader=createStoreReader("https://shop.example",{fetch:fetcher as any,lookup:async()=>[{address:"8.8.8.8",family:4}] as any,intervalMs:0,sleep:async()=>{}});
    expect(await reader.discover()).toEqual([url]);expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rechaza redirecciones externas antes de solicitarlas",async()=>{
    const fetcher=vi.fn(async()=>new Response(null,{status:301,headers:{location:"https://evil.example/"}}));
    const reader=createStoreReader("https://shop.example",{fetch:fetcher as any,lookup:async()=>[{address:"8.8.8.8",family:4}] as any,intervalMs:0,sleep:async()=>{}});
    await expect(reader.read(url)).rejects.toThrow("fuera");expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("reintenta errores transitorios tres veces, pero no un 404",async()=>{
    const fetcher=vi.fn(async()=>new Response(null,{status:503}));
    const options={fetch:fetcher as any,lookup:async()=>[{address:"8.8.8.8",family:4}] as any,intervalMs:0,sleep:async()=>{}};
    await expect(createStoreReader("https://shop.example",options).read(url)).rejects.toThrow("503");expect(fetcher).toHaveBeenCalledTimes(3);
    fetcher.mockClear();fetcher.mockImplementation(async()=>new Response(null,{status:404}));await expect(createStoreReader("https://shop.example",options).read(url)).rejects.toThrow("404");expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
