import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
import { parse } from "node:url";
import next from "next";

function log(message) {
  appendFileSync("dev-server.log", `${new Date().toISOString()} ${message}\n`);
  console.log(message);
}

process.on("uncaughtException", (error) => {
  log(`uncaughtException: ${error.stack || error.message}`);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  log(`unhandledRejection: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});

const hostname = process.env.HOSTNAME || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const app = next({ dev: true, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  const parsedUrl = parse(req.url ?? "/", true);
  handle(req, res, parsedUrl);
}).listen(port, hostname, () => {
  log(`Ready on http://${hostname}:${port}`);
});

server.on("error", (error) => {
  log(`server error: ${error.stack || error.message}`);
  process.exit(1);
});

setInterval(() => {
  log("heartbeat");
}, 60_000);

await new Promise(() => {});
