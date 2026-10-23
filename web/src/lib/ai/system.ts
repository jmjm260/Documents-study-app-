// Instrucciones fijas de Tocorito (personalidad + reglas de calendario), iguales en cada mensaje.
import { TOCORITO_PROMPT } from "../chat";
import { CALENDAR_RULES } from "../chat-actions";

export const TOCORITO_SYSTEM = `${TOCORITO_PROMPT}\n${CALENDAR_RULES}`;
