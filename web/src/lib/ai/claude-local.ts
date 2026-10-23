// SOLO PARA PRUEBAS LOCALES: Tocorito responde con Claude Code instalado en esta computadora
// (tu sesión de Claude), sin clave de API. No sirve en Railway ni en producción.
// Se activa con CHAT_PROVIDER=claude en web/.env.local.
//
// Velocidad: arrancar Claude Code tarda ~6 s, pero el modelo responde en ~1-2 s. Por eso dejamos
// un proceso "pre-calentado" esperando por cada nivel: al llegar un mensaje ya está listo, y en
// cuanto se usa arrancamos otro para el siguiente mensaje.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatMessage } from "../chat";
import type { ReasoningLevel } from "./reasoning";
import { ProviderError, type ChatProvider, type ChatRequest, type LevelSupport, type ProviderEvent } from "./types";

const TIMEOUT_MS = 120_000;

/** Traduce el nivel a modelo + esfuerzo de Claude Code (configurable con variables de entorno). */
export function claudeReasoningConfig(level: ReasoningLevel): { model: string; effort: string } {
  const env = process.env;
  return {
    instant: { model: env.CLAUDE_MODEL_INSTANT || "haiku", effort: "low" },
    medium: { model: env.CLAUDE_MODEL_MEDIUM || env.CLAUDE_MODEL || "sonnet", effort: "medium" },
    high: { model: env.CLAUDE_MODEL_HIGH || env.CLAUDE_MODEL || "sonnet", effort: "high" },
  }[level];
}

/** Convierte el historial en un solo texto (el proceso recibe un único mensaje). */
export function transcriptFor(messages: ChatMessage[], context: string): string {
  const lines = messages.map((m) => `${m.role === "user" ? "Estudiante" : "Tocorito"}: ${m.content}`);
  return [
    ...(context ? [context, ""] : []),
    "Conversación hasta ahora:",
    "",
    ...lines,
    "",
    "Responde como Tocorito al último mensaje del estudiante. Escribe solo tu respuesta (con los bloques [[CALENDARIO]] si hace falta).",
  ].join("\n");
}

/** Texto de la conversación + las fotos del último mensaje como bloques de imagen. */
export function userContent(messages: ChatMessage[], context: string) {
  const images = messages.at(-1)?.images ?? [];
  const text = transcriptFor(messages, context);
  if (!images.length) return text;
  return [
    { type: "text", text: `${text}

(El último mensaje del estudiante incluye ${images.length} foto${images.length > 1 ? "s" : ""}, abajo.)` },
    ...images.map((url) => {
      const [, mediaType, data] = url.match(/^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/) ?? [];
      return { type: "image", source: { type: "base64", media_type: mediaType, data } };
    }),
  ];
}

type Warm = { child: ChildProcess; dir: string; system: string; lines: string[]; waiters: (() => void)[]; exited: boolean; stderr: string };

// Guardado en globalThis para no dejar procesos huérfanos cuando Next recarga el código en desarrollo.
const g = globalThis as unknown as { __tocoritoPool?: Map<ReasoningLevel, Warm> };
const pool = (g.__tocoritoPool ??= new Map());

function quoteForCmd(arg: string): string {
  return arg === "" ? '""' : /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

async function startProcess(level: ReasoningLevel, system: string): Promise<Warm> {
  // Carpeta temporal vacía: Claude no ve el proyecto ni carga su CLAUDE.md, hooks o MCP.
  const dir = await mkdtemp(join(tmpdir(), "tocorito-"));
  const promptFile = join(dir, "system.txt");
  await writeFile(promptFile, system, "utf8");
  const { model, effort } = claudeReasoningConfig(level);
  const args = [
    "-p",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--model", model,
    "--effort", effort,
    "--tools", "",
    "--system-prompt-file", promptFile,
    "--setting-sources", "",
    "--strict-mcp-config",
    "--no-session-persistence",
  ];
  const bin = process.env.CLAUDE_CLI_PATH || "claude";
  // En Windows, un "claude" instalado con npm es un .cmd y necesita la shell.
  const useShell = process.platform === "win32" && !/\.exe$/i.test(bin);
  const child = useShell
    ? spawn([quoteForCmd(bin), ...args.map(quoteForCmd)].join(" "), { cwd: dir, shell: true, windowsHide: true, env: { ...process.env, OPENAI_API_KEY: "" } })
    : spawn(bin, args, { cwd: dir, windowsHide: true, env: { ...process.env, OPENAI_API_KEY: "" } });

  const warm: Warm = { child, dir, system, lines: [], waiters: [], exited: false, stderr: "" };
  let buffer = "";
  const wake = () => warm.waiters.splice(0).forEach((w) => w());
  child.stdout?.on("data", (d) => {
    buffer += d;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      warm.lines.push(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
    wake();
  });
  child.stderr?.on("data", (d) => (warm.stderr = (warm.stderr + d).slice(-500)));
  const finish = () => {
    warm.exited = true;
    if (pool.get(level) === warm) pool.delete(level);
    rm(dir, { recursive: true, force: true }).catch(() => {});
    wake();
  };
  child.on("exit", finish);
  child.on("error", finish);
  return warm;
}

/** Deja listo un proceso para el próximo mensaje de este nivel. */
function prewarm(level: ReasoningLevel, system: string) {
  const current = pool.get(level);
  if (current && !current.exited && current.system === system) return;
  if (current) current.child.kill();
  startProcess(level, system)
    .then((w) => pool.set(level, w))
    .catch(() => {});
}

function takeProcess(level: ReasoningLevel, system: string): Promise<Warm> {
  const warm = pool.get(level);
  pool.delete(level);
  if (warm && !warm.exited && warm.system === system) return Promise.resolve(warm);
  warm?.child.kill();
  return startProcess(level, system);
}

process.once("exit", () => pool.forEach((w) => w.child.kill()));

export function createClaudeLocalProvider(): ChatProvider {
  return {
    id: "claude-local",
    levels(): LevelSupport[] {
      return (["instant", "medium", "high"] as const).map((level) => ({ level, model: claudeReasoningConfig(level).model, realReasoning: true }));
    },
    async *stream(req: ChatRequest): AsyncGenerator<ProviderEvent> {
      const proc = await takeProcess(req.level, req.system);
      // Mientras respondemos, ya arrancamos el siguiente proceso de este nivel.
      prewarm(req.level, req.system);

      const message = { type: "user", message: { role: "user", content: userContent(req.messages, req.context) } };
      proc.child.stdin?.write(JSON.stringify(message) + "\n");

      const deadline = Date.now() + TIMEOUT_MS;
      let generating = false;
      try {
        for (;;) {
          if (!proc.lines.length) {
            if (proc.exited) throw new ProviderError("Tocorito (Claude local) no pudo responder. Inténtalo de nuevo.", proc.stderr || "el proceso terminó");
            if (Date.now() > deadline) throw new ProviderError("Tocorito tardó demasiado. Inténtalo de nuevo.", "timeout");
            await new Promise<void>((r) => {
              proc.waiters.push(r);
              setTimeout(r, 1000);
            });
            continue;
          }
          let ev: {
            type?: string;
            event?: { type?: string; content_block?: { type?: string }; delta?: { type?: string; text?: string } };
            is_error?: boolean;
            result?: string;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          try {
            ev = JSON.parse(proc.lines.shift()!);
          } catch {
            continue;
          }
          if (ev.type === "stream_event") {
            const e = ev.event;
            if (e?.type === "content_block_start" && e.content_block?.type === "thinking") yield { type: "status", status: "thinking" };
            if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) {
              if (!generating) {
                generating = true;
                yield { type: "status", status: "generating" };
              }
              yield { type: "text", delta: e.delta.text };
            }
          } else if (ev.type === "result") {
            if (ev.is_error) {
              const detail = ev.result ?? "error desconocido";
              if (/not logged in|login/i.test(detail)) {
                throw new ProviderError("Claude no tiene la sesión iniciada. Ejecuta `claude auth login` en una terminal.", detail);
              }
              throw new ProviderError("Tocorito (Claude local) no pudo responder. Inténtalo de nuevo.", detail);
            }
            // Si no hubo texto en streaming (raro), mandamos el resultado completo.
            if (!generating && ev.result) {
              yield { type: "status", status: "generating" };
              yield { type: "text", delta: ev.result };
            }
            yield { type: "usage", inputTokens: ev.usage?.input_tokens ?? null, outputTokens: ev.usage?.output_tokens ?? null };
            return;
          }
        }
      } finally {
        proc.child.stdin?.end();
        setTimeout(() => !proc.exited && proc.child.kill(), 5000);
      }
    },
  };
}

/** Arranca procesos de todos los niveles por adelantado (se llama al cargar la API). */
export function prewarmAll(system: string) {
  for (const level of ["instant", "medium", "high"] as const) prewarm(level, system);
}
