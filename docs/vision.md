# Visión del producto

Un asistente de estudio con IA que sabe qué tienes que entregar y te ayuda a hacerlo.

## Para quién

Adolescentes (13+) y adultos que estudian en secundaria o universidad y usan Canvas.
No es una app para niños: menores de 13 no pueden registrarse. Compran ellos (o sus padres)
directamente; no dependemos de acuerdos con escuelas.

## Funciones

1. **Contexto académico desde Canvas** — tareas, exámenes y fechas sin la API oficial.
2. **Tutor con IA** — explicaciones, ejercicios y repasos a partir de los materiales del estudiante.
3. **Modo Focus** — sesiones cortas que limitan distracciones, según lo que permita cada plataforma.
4. **Suscripción** con Stripe (al final).

## Ruta

| Fase | Qué | Estado |
|---|---|---|
| 1 | Fundación: repo, CLAUDE.md, docs, subagentes, hooks | ✅ hecha |
| 2 | Validación: inspeccionar un `.ics` real de Canvas con el inspector | ⏳ siguiente |
| 3 | Investigación cruzada y mapa de arquitectura (base de datos, auth) | |
| 4 | MVP web: conexión por calendario, tutor IA, cuentas | 🟡 inspector de calendario + chat con Tocorito |
| 5 | Extensión de navegador para enriquecer tareas | |
| 6 | Móvil y modo Focus | |
| 7 | Stripe + revisión final de seguridad y legal | |
