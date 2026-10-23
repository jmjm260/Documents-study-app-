// PreToolUse hook (Bash): antes de un `git commit`, revisa lo que está en stage
// y bloquea si hay archivos .env o algo con forma de clave secreta.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const input = JSON.parse(readFileSync(0, "utf8"));
const command = input.tool_input?.command ?? "";
if (!/\bgit\b[^\n]*\bcommit\b/.test(command)) process.exit(0);

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const run = (cmd) => execSync(cmd, { cwd, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });

// Si el comando hace `git add` antes del commit, todavía no está en stage; revisamos también el working tree.
const files = run("git diff --cached --name-only") + run("git diff --name-only");
const envFile = files.split("\n").find((f) => /(^|\/)\.env(\.(?!example$)[^/]+)?$/.test(f.trim()));
if (envFile) {
  console.error(`Bloqueado: el commit incluiría ${envFile.trim()}. Los .env nunca se suben.`);
  process.exit(2);
}

const patterns = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "clave de Anthropic"],
  [/sk-(proj-|svcacct-)?[A-Za-z0-9_-]{40,}/, "clave de OpenAI"],
  [/sk_live_[A-Za-z0-9]{16,}/, "clave live de Stripe"],
  [/rk_live_[A-Za-z0-9]{16,}/, "clave restringida de Stripe"],
  [/AKIA[0-9A-Z]{16}/, "clave de AWS"],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, "token de GitHub"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "clave privada"],
  [/eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "JWT (¿service_role de Supabase?)"],
  [/\/feeds\/calendars\/user_[A-Za-z0-9]{10,}\.ics/, "URL privada de feed de Canvas"],
];
const diff = run("git diff --cached -U0") + run("git diff -U0");
const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
for (const [re, label] of patterns) {
  const hit = added.find((l) => re.test(l));
  if (hit) {
    console.error(`Bloqueado: posible ${label} en el commit. Muévelo a una variable de entorno.`);
    process.exit(2);
  }
}
process.exit(0);
