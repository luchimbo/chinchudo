import { execFile } from "node:child_process";

// Termina solo el proceso hijo creado por esta corrida y sus descendientes.
// El launcher de un venv en Windows puede dejar Python corriendo si se mata solo el padre.
export function terminateChild(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
  } else {
    child.kill("SIGTERM");
  }
}
