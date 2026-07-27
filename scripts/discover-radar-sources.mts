import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../src/lib/db";

type Candidate = { channel: string; label: string; query: string; targetUrl: string; topics: string[]; priority: number };

const candidates: Record<string, Candidate[]> = {
  pcmidi: [
    { channel: "youtube", label: "Radar YouTube · controladores MIDI", query: "controlador midi precio opiniones argentina", targetUrl: "https://www.youtube.com/results?search_query=controlador+midi+precio+opiniones+argentina", topics: ["controlador midi", "home studio", "precio"], priority: 95 },
    { channel: "youtube", label: "Radar YouTube · teclados MIDI", query: "teclado midi principiante comprar argentina", targetUrl: "https://www.youtube.com/results?search_query=teclado+midi+principiante+comprar+argentina", topics: ["teclado midi", "principiantes", "compra"], priority: 90 },
    { channel: "reddit", label: "Radar Reddit · producción musical", query: "home studio controlador midi recomendación", targetUrl: "https://www.reddit.com/search/?q=home%20studio%20controlador%20midi", topics: ["home studio", "midi", "recomendación"], priority: 80 },
  ],
  "prestige-running": [
    { channel: "youtube", label: "Radar YouTube · zapatillas running", query: "zapatillas running comprar argentina opiniones", targetUrl: "https://www.youtube.com/results?search_query=zapatillas+running+comprar+argentina+opiniones", topics: ["running", "zapatillas", "compra"], priority: 95 },
    { channel: "reddit", label: "Radar Reddit · running", query: "running zapatillas lesión entrenamiento recomendación", targetUrl: "https://www.reddit.com/search/?q=running+zapatillas+entrenamiento", topics: ["running", "entrenamiento", "zapatillas"], priority: 85 },
    { channel: "instagram", label: "Radar Instagram · running", query: "running argentina zapatillas entrenamiento", targetUrl: "https://www.instagram.com/explore/tags/running/", topics: ["running", "entrenamiento"], priority: 75 },
  ],
  jurispedia: [
    { channel: "youtube", label: "Radar YouTube · consultas legales", query: "consulta legal argentina despido alquiler consumidor", targetUrl: "https://www.youtube.com/results?search_query=consulta+legal+argentina+despido+alquiler", topics: ["derecho laboral", "alquiler", "consumidor"], priority: 95 },
    { channel: "reddit", label: "Radar Reddit · derecho argentino", query: "consulta legal argentina despido alquiler alimentos", targetUrl: "https://www.reddit.com/search/?q=consulta+legal+argentina", topics: ["consulta legal", "derecho argentino"], priority: 90 },
    { channel: "facebook", label: "Radar Facebook · consultas jurídicas", query: "consulta legal argentina derechos laborales alquiler", targetUrl: "https://www.facebook.com/search/posts/?q=consulta%20legal%20argentina", topics: ["consulta legal", "derechos laborales"], priority: 70 },
  ],
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const clientFlag = process.argv.find((arg) => arg.startsWith("--client="))?.slice(9);
  const clients = await prisma.client.findMany({ where: { active: true, ...(clientFlag ? { slug: clientFlag } : {}) }, select: { id: true, slug: true } });
  const report: any[] = [];
  for (const client of clients) {
    const proposed = candidates[client.slug] || [];
    let created = 0;
    for (const source of proposed) {
      const exists = await prisma.monitoredSource.findUnique({ where: { label: source.label } });
      if (exists) continue;
      if (!dryRun) await prisma.monitoredSource.create({ data: { clientId: client.id, label: source.label, channel: source.channel, query: source.query, targetUrl: source.targetUrl, sourceKind: "watchlist", lifecycle: "active", priority: source.priority, expectedTopics: source.topics, limit: 20 } });
      created += 1;
    }
    report.push({ client: client.slug, proposed: proposed.length, created, dryRun });
  }
  await mkdir(join(process.cwd(), "reports"), { recursive: true });
  const reportPath = join(process.cwd(), "reports", `${new Date().toISOString().replace(/[:.]/g, "-")}-discover-sources.json`);
  await writeFile(reportPath, JSON.stringify({ command: "discover-sources", report }, null, 2));
  console.log(JSON.stringify({ report, reportPath }, null, 2));
  await prisma.$disconnect();
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
