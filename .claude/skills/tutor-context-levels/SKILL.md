---
name: tutor-context-levels
description: Cómo debe comportarse el tutor de IA según el nivel de contexto de una tarea (completo, parcial, solo_titulo). Úsala al escribir prompts del tutor o lógica que asigne niveles.
---

# Niveles de contexto del tutor

Definidos en `web/src/lib/tasks.ts` (`ContextLevel`).

| Nivel | Criterio | Comportamiento del tutor |
|---|---|---|
| `solo_titulo` | Solo título/fecha/curso, sin descripción útil | Ayuda a planificar y pide al estudiante el enunciado. **Nunca** supone de qué trata la tarea a partir del título. |
| `parcial` | Hay descripción pero incompleta (corta, truncada o sin rúbrica) | Explica conceptos que aparecen literalmente en la descripción; señala qué falta y pide que lo comparta. |
| `completo` | Enunciado completo (y, si existe, rúbrica/materiales) importado por el estudiante | Tutoría completa: explicar, guiar, generar ejercicios. Sigue sin hacer la tarea por el estudiante. |

## Reglas para el prompt del tutor
- Incluir siempre el nivel y la frase: "Si una información no está en el contexto, dilo; no la inventes."
- Citar de dónde sale cada dato (título, descripción, material subido).
- Integridad académica: guiar y explicar, no entregar la solución final de una tarea evaluada.
