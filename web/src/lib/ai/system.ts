// Instrucciones fijas de Tocorito (personalidad + reglas de calendario y Focus), iguales en cada mensaje.
import { TOCORITO_PROMPT } from "../chat";
import { CALENDAR_RULES } from "../chat-actions";
import { FOCUS_RULES } from "../focus";

export const TOCORITO_SYSTEM = `${TOCORITO_PROMPT}\n${CALENDAR_RULES}\n${FOCUS_RULES}`;
