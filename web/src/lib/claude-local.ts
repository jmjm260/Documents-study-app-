// SOLO PARA PRUEBAS LOCALES: Tocorito responde usando Claude Code instalado en esta
// computadora (tu sesión de Claude), sin clave de API. No sirve en Railway ni en producción.
// Se activa con CHAT_PROVIDER=claude en web/.env.local.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOCORITO_PROMPT, type ChatMessage } from "./chat";

const TIMEOUT_MS = 90_000;

export class ClaudeLocalError extends Error {
  constructor(public friendly: string, detail: string) {
    super(detail);
  }
}

/** Convierte el historial en un solo texto, porque el modo -p recibe un único mensaje. */
export function transcriptFor(messages: ChatMessage[]): string {
  const lines = messages.map((m) => `${m.role === "user" ? "Estudiante" : "Tocorito"}: ${m.content}`);
  return [
    "Conversación hasta ahora:",
    "",
    ...lines,
    "",
    "Responde como Tocorito al último mensaje del estudiante. Escribe solo el texto de tu respuesta.",
  ].join("\n");
}

export async function askTocoritoLocal(messages: ChatMessage[]): Promise<string> {
  // Carpeta temporal vacía: así Claude no ve el proyecto ni carga su CLAUDE.md, hooks o MCP.
  const dir = await mkdtemp(join(tmpdir(), "tocorito-"));
  const promptFile = join(dir, "system.txt");
  await writeFile(promptFile, TOCORITO_PROMPT, "utf8");

  const bin = process.env.CLAUDE_CLI_PATH || "claude";
  const args = [
    "-p",
    "--output-format", "json",
    "--model", process.env.CLAUDE_MODEL || "sonnet",
    "--tools", "",
    "--system-prompt-file", promptFile,
    "--setting-sources", "",
    "--strict-mcp-config",
    "--no-session-persistence",
  ];

  try {
    const stdout = await run(bin, args, dir, transcriptFor(messages));
    const data = JSON.parse(stdout) as { result?: string; is_error?: boolean };
    if (data.is_error) {
      const detail = data.result ?? "error desconocido";
      if (/not logged in|login/i.test(detail)) {
        throw new ClaudeLocalError("Claude no tiene la sesión iniciada. Ejecuta `claude` en una terminal y entra con tu cuenta.", detail);
      }
      throw new ClaudeLocalError("Tocorito (Claude local) no pudo responder. Inténtalo de nuevo.", detail);
    }
    return data.result?.trim() || "Mmm… me quedé dormido un segundo ☕ ¿Me lo repites?";
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(bin: string, args: string[], cwd: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // En Windows, un "claude" instalado con npm es un .cmd y necesita la shell.
    const useShell = process.platform === "win32" && !/\.exe$/i.test(bin);
    const child = spawn(useShell ? `"${bin}"` : bin, useShell ? args.map(quoteForCmd) : args, {
      cwd,
      shell: useShell,
      windowsHide: true,
      env: { ...process.env, OPENAI_API_KEY: "" },
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new ClaudeLocalError("No encontré Claude Code en esta computadora. Instálalo o pon CLAUDE_CLI_PATH en .env.local.", e.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (out.trim().startsWith("{")) return resolve(out);
      reject(new ClaudeLocalError("Tocorito (Claude local) no pudo responder. Inténtalo de nuevo.", `exit ${code}: ${err.slice(0, 300)}`));
    });
    child.stdin.end(input, "utf8");
  });
}

function quoteForCmd(arg: string): string {
  return arg === "" ? '""' : /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}
