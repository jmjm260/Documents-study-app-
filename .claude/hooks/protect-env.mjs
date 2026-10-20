// PreToolUse hook: bloquea que Claude lea o edite archivos .env (excepto .env.example).
// Exit code 2 = bloquear la acción y mostrar el motivo a Claude.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const filePath = input.tool_input?.file_path ?? input.tool_input?.path ?? "";
const name = basename(filePath);

if (/^\.env(\..+)?$/.test(name) && name !== ".env.example") {
  console.error(
    `Bloqueado: ${name} contiene secretos y está protegido. ` +
      "Documenta variables en .env.example y pide al usuario que edite .env a mano."
  );
  process.exit(2);
}
process.exit(0);
