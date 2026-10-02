import { buildEditorialBrief, catalogSources, reviewArticle } from "../src/lib/blog-quality.mjs";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const data = JSON.parse(input);
data.sources = [...catalogSources(data.products, data.now), ...(data.sources || [])];
process.stdout.write(JSON.stringify(data.command === "brief" ? buildEditorialBrief(data) : reviewArticle(data)));
