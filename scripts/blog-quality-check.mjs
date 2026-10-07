import { buildEditorialBrief, catalogSources, reviewArticle } from "../src/lib/blog-quality.mjs";
import { completeArticle } from "../src/lib/article-completion.mjs";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const data = JSON.parse(input);
data.sources = [...catalogSources(data.products, data.now), ...(data.sources || [])];
if (data.command === "complete") {
  const allowed = data.content.editorial_brief?.allowedProductIds;
  const catalog = {
    products: Object.entries(data.products || {}).filter(([id]) => !Array.isArray(allowed) || allowed.includes(id)).map(([ref, p]) => ({ ref, name: p.nombre || p.name || p.modelo, aliases: [p.modelo, p.modelo ? [p.marca, p.modelo].filter(Boolean).join(" ") : ""].filter(Boolean), disabled: p.linkStatus === "missing" || !p.url })),
    categories: Object.entries(data.categories || {}).map(([ref, c]) => ({ ref, name: c.nombre || c.name, disabled: c.linkStatus === "missing" || !c.url })),
    guides: (data.existing || []).filter(g => g.slug && ["GUIDE", "PILLAR"].includes(g.content_type) && g.indexing_state === "INDEX" && g.status === "PUBLISHED").map(g => ({ ref: g.slug, name: g.h1 || g.titulo || g.keyword, keyword: g.keyword, detail: g.cluster_name })),
  };
  process.stdout.write(JSON.stringify(completeArticle({ ...data, catalog })));
} else process.stdout.write(JSON.stringify(data.command === "brief" ? buildEditorialBrief(data) : reviewArticle(data)));
