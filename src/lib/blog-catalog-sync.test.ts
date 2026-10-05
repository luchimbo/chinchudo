import { describe,it,expect,vi,afterEach } from "vitest";
import { applyCatalogSync,importedFields,matchCatalogRow,planCatalogChanges,crawlCatalog, type CrawlCheckpoint } from "./blog-catalog-sync";
import type { StoreSnapshot } from "./tiendanube-public";
import { catalogHtmlHash,catalogHtmlLinks } from "./blog-catalog-worker";

const snapshot:StoreSnapshot={kind:"product",id:"123",url:"https://shop.example/productos/new/",name:"Arturia MiniLab",brand:"Arturia",description:"Descripción nueva",sku:"A1",categories:[],price:"100",currency:"ARS",availability:"InStock",fetchedAt:"2026-10-03T12:00:00Z"};
const row={id:"local",clientId:"a",externalId:"arturia-minilab",name:snapshot.name,brand:"Arturia",url:"https://shop.example/productos/old/",tiendanubeId:"123",useText:"Texto curado",categoryKey:"controladores",sourceSnapshot:{description:"Anterior"},missingRuns:0,lastMissingDate:"",linkStatus:"active"};
afterEach(()=>vi.useRealTimers());
function fakeDb(initial:any[]){
  let products=structuredClone(initial);let run:any={id:"run",clientId:"a",checkpoint:{},changes:[]};
  const db:any={landingProduct:{findMany:async({where}:any)=>products.filter((p:any)=>p.clientId===where.clientId),update:async({where,data}:any)=>Object.assign(products.find((p:any)=>p.id===where.id),data),upsert:async({where,create,update}:any)=>{const r=products.find((p:any)=>p.clientId===where.clientId_externalId.clientId&&p.externalId===where.clientId_externalId.externalId);if(r)return Object.assign(r,update);products.push({...create,id:"new"});return products.at(-1);}},landingCategory:{findMany:async()=>[]},catalogSyncRun:{findFirstOrThrow:async()=>run,update:async({data}:any)=>Object.assign(run,data)},$transaction:async(fn:any)=>fn(db)};
  db.$executeRaw=vi.fn(async(_sql:any,data:string,clientId:string)=>{for(const value of JSON.parse(data)){const target=products.find((p:any)=>p.id===value.id&&p.clientId===clientId);if(target)Object.assign(target,value.fields);}return 1;});
  return {db,products:()=>products,resetRun:()=>{run={id:"run",clientId:"a",checkpoint:{},changes:[]};}};
}
const checkpoint=(snapshots:StoreSnapshot[]=[],failures:CrawlCheckpoint["failures"]=[]):CrawlCheckpoint=>({urls:[row.url],cursor:1,snapshots,failures,discoveryComplete:true});
describe("sincronización del catálogo del blog",()=>{
  it("conserva la referencia del artículo al cambiar URL",()=>expect(planCatalogChanges([row],[],checkpoint([snapshot]))[0]).toMatchObject({ref:"arturia-minilab",action:"update",afterUrl:snapshot.url}));
  it("vincula una URL anterior que redirige aunque también haya cambiado el nombre",()=>expect(matchCatalogRow([{...row,tiendanubeId:null}],{...snapshot,name:"Nuevo nombre",requestedUrls:[row.url]}).row?.id).toBe("local"));
  it("no duplica coincidencias ambiguas",()=>expect(planCatalogChanges([{...row,tiendanubeId:null},{...row,id:"otro",tiendanubeId:null}],[],checkpoint([snapshot]))[0]).toMatchObject({action:"review",candidates:["local","otro"]}));
  it("no reasigna un producto ya vinculado a otro ID",()=>expect(matchCatalogRow([row],{...snapshot,id:"999"}).candidates).toHaveLength(1));
  it("no pisa textos curados y sigue campos previamente importados",()=>{
    expect(importedFields(row,snapshot)).not.toHaveProperty("useText");expect(importedFields({...row,name:"Nombre manual"},snapshot)).not.toHaveProperty("name");expect(importedFields({...row,name:"Anterior",sourceSnapshot:{name:"Anterior"}},snapshot)).toHaveProperty("name",snapshot.name);
  });
  it("detecta una pasada idéntica aunque cambie la fecha de lectura",()=>expect(planCatalogChanges([{...row,url:snapshot.url,sourceSnapshot:{...snapshot,fetchedAt:"2026-10-02"}}],[],checkpoint([snapshot]))[0].action).toBe("seen"));
  it("ignora el orden de claves JSONB de los breadcrumbs al comparar snapshots",()=>{
    const current={...snapshot,categories:[{name:"Controladores",url:"https://shop.example/controladores/"}]};
    const prior={...current,categories:[{url:current.categories[0].url,name:current.categories[0].name}]};
    expect(planCatalogChanges([{...row,url:current.url,sourceSnapshot:prior}],[],checkpoint([current]))[0].action).toBe("seen");
  });
  it("actualiza la evidencia fechada sin cambiar referencias ni contenido curado",async()=>{
    const existing={...row,url:snapshot.url,sourceSnapshot:{...snapshot,fetchedAt:"2026-10-02",editorialEligible:true}};
    const db=fakeDb([existing]);
    await applyCatalogSync(db.db,"run","a",checkpoint([snapshot]));
    expect(db.products()[0]).toMatchObject({externalId:row.externalId,useText:"Texto curado",sourceSnapshot:{fetchedAt:snapshot.fetchedAt,editorialEligible:true}});
    expect(db.db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(importedFields({...row,useText:"",sourceSnapshot:{}},snapshot)).toHaveProperty("useText",snapshot.description);
    expect(importedFields({...row,useText:"Anterior"},snapshot)).toHaveProperty("useText",snapshot.description);
  });
  it("persiste cambios masivos en un lote sin duplicar ni reemplazar textos curados",async()=>{
    const products=Array.from({length:150},(_,i)=>({...row,id:`local-${i}`,externalId:`ref-${i}`,tiendanubeId:String(1000+i),name:`Nombre curado ${i}`}));
    const snapshots=products.map(p=>({...snapshot,id:p.tiendanubeId,url:`https://shop.example/productos/${p.tiendanubeId}/`}));
    const db=fakeDb(products);await applyCatalogSync(db.db,"run","a",checkpoint(snapshots));
    expect(db.products()).toHaveLength(150);
    expect(db.products().every((p,i)=>p.url===snapshots[i].url&&p.name===products[i].name&&p.useText===row.useText&&p.externalId===products[i].externalId)).toBe(true);
    expect(db.db.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it("confirma 404 en dos días distintos y restaura una ficha reaparecida",async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));const db=fakeDb([row]);const missing=checkpoint([],[{url:row.url,status:404,error:"404"}]);
    await applyCatalogSync(db.db,"run","a",missing);expect(db.products()[0].linkStatus).toBe("active");db.resetRun();await applyCatalogSync(db.db,"run","a",missing);expect(db.products()[0].missingRuns).toBe(1);
    vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));db.resetRun();await applyCatalogSync(db.db,"run","a",missing);expect(db.products()[0].linkStatus).toBe("missing");
    db.resetRun();await applyCatalogSync(db.db,"run","a",checkpoint([snapshot]));expect(db.products()[0]).toMatchObject({linkStatus:"active",missingRuns:0,url:snapshot.url});
  });
  it("un recorrido incompleto no suma bajas ni toca otro cliente",async()=>{
    const db=fakeDb([row,{...row,id:"b",clientId:"b"}]);await applyCatalogSync(db.db,"run","a",checkpoint([],[{url:row.url,status:404,error:"404"},{url:"https://shop.example/productos/otro/",status:503,error:"503"}]));expect(db.products().map(p=>p.missingRuns)).toEqual([0,0]);
  });
  it("retoma desde el checkpoint sin leer otra vez fichas completadas",async()=>{
    const reader:any={setRobots:vi.fn(),read:vi.fn(async(url:string)=>({url,text:url.endsWith("robots.txt")?"User-agent: *":"<h1>Categoría</h1><script>LS.category = {id : 4,};</script>"})),validate:async()=>{}};
    const saved:unknown[]=[];const state={...checkpoint(),urls:["https://shop.example/first/","https://shop.example/second/"],cursor:1};await crawlCatalog(reader,[],state,async c=>{saved.push(c);});expect(reader.read.mock.calls.map((c:any)=>c[0])).not.toContain(state.urls[0]);expect(saved).toHaveLength(1);
  });
  it("la marca de versión no fuerza otro despliegue; compara enlaces decodificados",()=>{
    expect(catalogHtmlHash('<head><meta name="catalog-sync-version" content="a"></head>')).toBe(catalogHtmlHash('<head><meta name="catalog-sync-version" content="b"></head>'));
    expect(catalogHtmlLinks('<a href="https://shop.example/p?a=1&amp;b=2">x</a><a href="https://other.example/">y</a>',"https://shop.example")).toEqual(["https://shop.example/p?a=1&b=2"]);
  });
});
