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
- **IA:** Claude API (pendiente; controlar costo por estudiante).

## Piezas implementadas

- `web/src/lib/ics.ts` — parser de iCal sin dependencias (+ pruebas).
- `web/src/lib/tasks.ts` — convierte eventos en tareas y asigna nivel de contexto.
- `web/src/app/api/calendar/preview/route.ts` — descarga un feed de Canvas y lo devuelve parseado (no guarda nada).
- `web/src/app/page.tsx` — inspector: pega tu URL de feed y ve qué datos trae.
