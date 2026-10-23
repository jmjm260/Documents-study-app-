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
- **Base de datos y auth:** sin decidir (candidata: Supabase). Hasta decidirlo, el MVP
  **no guarda** datos: el inspector procesa el feed y lo descarta.
- **IA:** capa `web/src/lib/ai/` con proveedores intercambiables (OpenAI o Claude local en pruebas), niveles de razonamiento y streaming (ADR 0002 y 0004).

## Piezas implementadas

- `web/src/lib/ics.ts` — parser de iCal sin dependencias (+ pruebas).
- `web/src/lib/tasks.ts` — convierte eventos en tareas y asigna nivel de contexto.
- `web/src/app/api/calendar/preview/route.ts` — descarga un feed de Canvas y lo devuelve parseado (no guarda nada).
- `web/src/app/page.tsx` — chat con Tocorito (mascota y tutor).
- `web/src/app/api/chat/route.ts` + `web/src/lib/chat.ts` — llamada a OpenAI, prompt y validación.
- `web/src/app/calendario/page.tsx` — calendario mensual con agenda del día, anotaciones propias y conexión a Canvas en una hoja.
- `web/src/lib/calendar.ts` — cuadrícula del mes y tareas agrupadas por día (+ pruebas).
- `web/src/lib/entries.ts` — anotaciones propias (tarea, examen, nota), validación y vista unificada con Canvas (+ pruebas). Hoy en localStorage; con cuentas irán a la base de datos.
- `web/src/components/calendar/` — MonthGrid, DayAgenda, EntryForm, CanvasConnect.
- `web/src/components/Sheet.tsx` — hoja modal que sube desde abajo (estilo iOS).
- `web/src/lib/chat-actions.ts` — Tocorito lee el calendario y anota cosas con bloques [[CALENDARIO]] (ADR 0003, + pruebas).
- `web/src/lib/reminders.ts` + `web/src/components/ReminderCenter.tsx` — recordatorios (aviso en la app + notificación del sistema; en web solo con la app abierta).
- `web/src/components/chat/ActionCard.tsx` — tarjeta en el chat de lo que Tocorito anotó, con Deshacer.
- `web/src/lib/ai/` — capa de IA: niveles de razonamiento, proveedores (OpenAI, Claude local pre-calentado), streaming y uso (ADR 0004).
- `web/src/components/chat/LevelPicker.tsx` — botón "Medio ⌄" dentro de la barra de mensaje que abre un deslizador Instantáneo / Medio / Alto (estilo ChatGPT).
- `web/src/components/TabBar.tsx` — barra de pestañas inferior (Tocorito / Calendario), estilo app móvil.
