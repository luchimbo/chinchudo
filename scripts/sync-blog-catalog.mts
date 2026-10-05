import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { runCatalogWorker } from "../src/lib/blog-catalog-worker";
try {
  for (const line of readFileSync(".env","utf8").split(/\r?\n/)) {
    const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if(m && !(m[1] in process.env)) process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");
  }
} catch { /* Server environment can supply configuration. */ }
const prisma=new PrismaClient();
const args=process.argv.slice(2), index=args.indexOf("--client");
const client=index>=0?args[index+1]:"pcmidi";
try {
  if(args.includes("--help")){
    console.log("Uso: npm.cmd run blog:sync-catalog -- --client pcmidi [--dry-run]");
  }else{
  if(index<0&&!args.includes("--scheduled"))throw new Error("Falta --client. En PowerShell usá npm.cmd run blog:sync-catalog -- --client pcmidi [--dry-run].");
  const result=await runCatalogWorker(prisma,client,{dryRun:args.includes("--dry-run"),force:!args.includes("--scheduled"),scheduled:args.includes("--scheduled")});
  console.log(JSON.stringify(result));
  }
} catch(error) { console.error(error instanceof Error?error.message:String(error)); process.exitCode=1; }
finally { await prisma.$disconnect(); }
