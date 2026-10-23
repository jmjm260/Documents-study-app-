// Preferencias del usuario en este dispositivo. Con cuentas irán al perfil
// (user.defaultReasoningLevel) y se sincronizarán entre dispositivos.
import { DEFAULT_REASONING_LEVEL, isReasoningLevel, type ReasoningLevel } from "./ai/reasoning";

const PREFS_KEY = "tocorito.prefs.v1";

type Prefs = { defaultReasoningLevel: ReasoningLevel };

export function loadPrefs(): Prefs {
  try {
    const data = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return { defaultReasoningLevel: isReasoningLevel(data.defaultReasoningLevel) ? data.defaultReasoningLevel : DEFAULT_REASONING_LEVEL };
  } catch {
    return { defaultReasoningLevel: DEFAULT_REASONING_LEVEL };
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Sin almacenamiento: la preferencia dura mientras la pantalla esté abierta.
  }
}
