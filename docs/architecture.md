# Arquitectura

## Idea central: dos capas

```
            DETECCIÓN (automática, simple)          ENRIQUECIMIENTO (autorizado por el estudiante)
  Canvas ──► feed iCal (.ics) ─┐                    ┌─ extensión de navegador (computadora)
  Canvas ──► correos de aviso ─┼─► Tarea ◄──────────┼─ navegador integrado (móvil)
                               │   (título, fecha,  └─ captura / texto compartido
                               │    curso, nivel)
                               ▼
                         Tutor con IA  (se comporta según el nivel de contexto)
```

- **Detección** encuentra *qué* hay que hacer y *cuándo*. El feed iCal de Canvas es una
  URL privada que el propio estudiante copia desde *Calendario → Feed de calendario*.
  No usa contraseña ni token de API.
- **Enriquecimiento** consigue el *contenido* (enunciado, rúbrica) solo cuando el
  estudiante lo autoriza explícitamente.

## Niveles de contexto

| Nivel | Tenemos | El tutor puede |
|---|---|---|
| `solo_titulo` | título, fecha, curso | planificar tiempo, preguntar al estudiante por el enunciado; **no** resolver |
| `parcial` | + descripción corta del iCal o correo | explicar conceptos relacionados, pedir lo que falta |
| `completo` | + enunciado/rúbrica/materiales | tutoría completa sobre esa tarea |

## Stack actual

- **Web:** Next.js 15 (App Router) + TypeScript + Tailwind, en `web/`.
- **Despliegue:** Railway (pendiente).
- **Base de datos y auth:** Supabase (plan gratis, us-east-1): chats y perfiles con RLS, login por enlace al correo, solo 13+ (ADR 0007).
  Calendario y preferencias siguen en el dispositivo por ahora.
- **IA:** capa `web/src/lib/ai/` con proveedores intercambiables (OpenAI o Claude local en pruebas), niveles de razonamiento y streaming (ADR 0002 y 0004).

## Piezas implementadas

- `web/src/lib/ics.ts` — parser de iCal sin dependencias (+ pruebas).
- `web/src/lib/tasks.ts` — convierte eventos en tareas y asigna nivel de contexto.
- `web/src/app/api/calendar/preview/route.ts` — descarga un feed de Canvas y lo devuelve parseado (no guarda nada).
- `web/src/app/page.tsx` — chat con Tocorito (mascota y tutor).
- `web/src/app/api/chat/route.ts` + `web/src/lib/chat.ts` — llamada a OpenAI, prompt y validación.
- `web/src/app/calendario/page.tsx` — calendario mensual (oscuro) con agenda del día, anotaciones propias, papelera (lo de Canvas se oculta) y conexión a Canvas en una hoja.
- `web/src/lib/calendar.ts` — cuadrícula del mes y tareas agrupadas por día (+ pruebas).
- `web/src/lib/entries.ts` — anotaciones propias (tarea, examen, nota), validación y vista unificada con Canvas (+ pruebas). Hoy en localStorage; con cuentas irán a la base de datos.
- `web/src/components/calendar/` — MonthGrid, DayAgenda, EntryForm, CanvasConnect.
- `web/src/components/Sheet.tsx` — hoja modal que sube desde abajo (estilo iOS).
- `web/src/lib/chat-actions.ts` — Tocorito lee el calendario y anota cosas con bloques [[CALENDARIO]] (ADR 0003, + pruebas).
- `web/src/lib/reminders.ts` + `web/src/components/ReminderCenter.tsx` — recordatorios (aviso en la app + notificación del sistema; en web solo con la app abierta).
- `web/src/components/chat/ActionCard.tsx` — tarjeta en el chat de lo que Tocorito anotó, con Deshacer.
- `web/src/lib/ai/` — capa de IA: niveles de razonamiento, proveedores (OpenAI, Claude local pre-calentado), streaming y uso (ADR 0004).
- `web/src/components/chat/LevelPicker.tsx` — botón "Medio ⌄" dentro de la barra de mensaje que abre un deslizador Instantáneo / Medio / Alto (estilo ChatGPT).
- `web/src/lib/images.ts` + `web/src/components/chat/PhotoViewer.tsx` — fotos en el chat: se comprimen en el dispositivo y Tocorito resuelve lo que ve (ADR 0005).
- `web/src/components/chat/TocoritoFigure.tsx` + `web/src/lib/coffee.ts` — Tocorito de cuerpo entero en la esquina del chat (sin círculos); cuando "toma café" no lo escribe: pone [[CAFE]] y la app lo anima (`public/tocorito-idle.webp` / `tocorito-sip.webp`).
- `web/src/components/chat/SpeechBubble.tsx` + `useSpeech.ts` — Tocorito "habla": cada mensaje se escribe letra a letra en un globo junto a él (crece hacia la izquierda) y al terminar pasa al chat. Fondo del chat negro.
- `web/src/app/api/conversations/` + `web/src/lib/server/` — historial de chats en el SERVIDOR (ADR 0006): lista paginada solo con metadatos, mensajes al abrir, títulos con IA, identidad anónima por dispositivo. Almacenamiento provisional en archivos (`.data/`), listo para cambiar a base de datos.
- `web/src/components/chat/ChatSidebar.tsx` + `useConversations.ts` — panel lateral desde la izquierda (82%) con "Nuevo chat" y el historial; ☰ o deslizar desde el borde.
- `web/src/lib/supabase/` + `web/src/middleware.ts` + `web/src/components/auth/` — cuentas con Supabase: pantalla de inicio de sesión, sesión en cookies, regla 13+ (ADR 0007). `web/src/lib/server/supabase-store.ts` guarda los chats en la base de datos.
- `web/src/components/TabBar.tsx` — barra de pestañas inferior (Tocorito / Focus / Calendario), estilo app móvil.
- `web/src/lib/focus.ts` + `focus-store.ts` + `web/src/app/focus/page.tsx` + `web/src/app/api/focus/lesson/route.ts` — Focus:
  tras resolver una tarea ([[FOCUS]]), mini lección con tiempo mínimo y prueba rápida; el chat queda bloqueado hasta acabar (ADR 0008, + pruebas).
  Las lecciones se guardan por clase; al anotar un examen de una clase con lecciones ([[REPASO]]), `api/focus/review` hace una prueba de repaso.
  Piezas de pantalla en `web/src/components/focus/FocusParts.tsx`; `web/src/lib/ai/ask-once.ts` para preguntas sueltas a la IA.
- `web/src/lib/focus-map.ts` + `web/src/components/focus/CourseMap.tsx` — mapa de cursos estilo Duolingo en Focus:
  Tocorito arriba, una columna por curso con tareas, lecciones y exámenes por fecha (ADR 0009, + pruebas).
- Focus en tres pestañas (ADR 0010): Escuela (clases del calendario), Cursos y Libre (lo demás).
  `web/src/lib/courses.ts` + `courses-store.ts` + `web/src/components/focus/CoursesSection.tsx` + `web/src/app/api/focus/course/` —
  cursos que genera Tocorito: índice al crear, cada lección al abrirla, desbloqueo en orden y prueba por unidad (+ pruebas).
- `web/src/lib/sat/` + `web/src/lib/server/sat-*.ts` + `web/src/app/api/sat/` + `web/src/app/sat/` — entrenamiento SAT Reading and Writing
  (ADR 0011): temario de 11 familias, planificador A1→B1→A2, generación + revisión independiente, sin repetir, reinicio total,
  reloj del servidor y fase de velocidad (+ pruebas). Entrada desde Focus → Cursos.
- `web/src/lib/solution-image.ts` — imagen PNG limpia de la solución, dibujada en el dispositivo con canvas (gratis); se desbloquea al acabar el Focus (+ pruebas).
