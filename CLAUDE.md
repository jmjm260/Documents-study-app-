# Study App — guía para Claude

Asistente de estudio con IA para adolescentes (13+) y adultos: secundaria y universidad. Se vende
directo al estudiante (sin contratos con escuelas). Plataformas: web primero, luego
iOS/Android.

**Objetivo final: una app publicada en la App Store (y Google Play).** La web actual es solo
para probar. Cada decisión debe pensarse para móvil primero: navegación con barra de pestañas
inferior, botones táctiles de 44px mínimo, respetar las zonas seguras (notch, barra de inicio),
nada que dependa de pasar el ratón por encima, y código que se pueda reutilizar al empaquetar la
app (p. ej. con Capacitor o React Native). Si algo solo funciona en web, dilo.

El dueño del proyecto está aprendiendo arquitectura (viene de C++ y Arduino):
explica las decisiones en español, con frases cortas, y prefiere siempre la
solución más simple que funcione.

## Reglas innegociables

1. **Nunca** pedir, guardar ni registrar contraseñas de Canvas ni de la escuela.
2. **Nunca** pedir tokens personales de la API de Canvas ni claves de desarrollador de una institución.
3. Toda tarea lleva un **nivel de contexto**: `completo`, `parcial` o `solo_titulo`.
   El tutor **no inventa** contenido que no tiene (ver skill `tutor-context-levels`).
4. Público: **adolescentes (13+) y adultos**. No se permiten cuentas de menores de 13.
   Los de 13–17 siguen siendo menores ante la ley, así que sus datos van con el máximo cuidado: mínimo
   necesario, nada en logs, nada en URLs, nada a terceros sin necesidad (skill `minor-privacy`).
5. Secretos solo en variables de entorno. Nunca en el código ni en commits.
   `.env*` está protegido por hooks; usa `.env.example` para documentar variables.
6. Antes de añadir una dependencia, servicio o conector nuevo: explicar por qué y su costo.

## Estructura

- `web/` — app web (Next.js 15 + TypeScript + Tailwind). Aquí vive el MVP.
- `docs/` — visión, arquitectura, decisiones y riesgos. Léelos antes de cambios grandes:
  - @docs/vision.md
  - @docs/architecture.md
  - @docs/risks.md
  - `docs/decisions/` — un archivo por decisión (ADR).
- `.claude/agents/` — subagentes: researcher, architect, builder, security-qa.
- `.claude/skills/` — canvas-integration, minor-privacy, tutor-context-levels.
- `.claude/hooks/` — scripts Node que bloquean secretos y archivos `.env`.

## Comandos (desde `web/`)

- `npm run dev` — servidor local en http://localhost:3000
- `npm run build` — compila (úsalo para verificar antes de terminar)
- `npm run lint` — lint
- `npm test` — pruebas (vitest)

## Forma de trabajar

- Trabaja por fases (ver `docs/vision.md` → Ruta). No adelantes fases sin acuerdo.
- Cambios pequeños, con prueba cuando haya lógica (parsers, reglas de privacidad).
- Al tomar una decisión de arquitectura, crea un ADR en `docs/decisions/`.
