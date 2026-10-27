// Instrucciones fijas de Tocorito (personalidad + reglas de calendario, Focus y cursos), iguales en cada mensaje.
import { TOCORITO_PROMPT } from "../chat";
import { CALENDAR_RULES } from "../chat-actions";
import { COURSE_CHAT_RULES } from "../courses";
import { FOCUS_RULES } from "../focus";

export const TOCORITO_SYSTEM = `${TOCORITO_PROMPT}\n${CALENDAR_RULES}\n${FOCUS_RULES}\n${COURSE_CHAT_RULES}`;
