import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";

const reportsDir = "d:\\pcmidi-suite\\reports";

function main() {
  const files = readdirSync(reportsDir);
  
  const recentFailures = files
    .map((name) => {
      const path = join(reportsDir, name);
      const stat = statSync(path);
      return { name, path, mtime: stat.mtimeMs };
    })
    .filter((f) => f.name.endsWith("-publish.json"))
    .map((f) => {
      try {
        const content = JSON.parse(readFileSync(f.path, "utf-8"));
        return { ...f, content };
      } catch {
        return null;
      }
    })
    .filter((f) => f && f.content.success === false)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 5);

  console.log(`Printing top ${recentFailures.length} most recent failed publish reports:`);
  recentFailures.forEach((f) => {
    const { name, mtime, content } = f;
    console.log(`\nReport: ${name} (${new Date(mtime).toISOString()})`);
    console.log(`  Channel: ${content.channel}`);
    console.log(`  Account: ${content.account}`);
    console.log(`  Error: ${content.error}`);
    console.log(`  Url: ${content.url || content.source_url}`);
    console.log(`  Details: ${JSON.stringify(content.detail || content.details || content.message || content)}`);
  });
}

main();
