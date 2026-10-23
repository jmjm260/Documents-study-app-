# 0008 — Focus: mini lección obligatoria después de resolver una tarea

**Estado:** aceptada

## Contexto

Tocorito puede resolverle la tarea al estudiante. El dueño quiere que, a cambio, el estudiante
aprenda lo que se le resolvió: una mini lección de 2–4 minutos y una prueba rápida, sin poder saltarla.

## Decisión

- Cuando Tocorito resuelve una tarea, escribe la marca oculta `[[FOCUS]]{"tema","tarea"}[[/FOCUS]]`
  (igual que `[[CALENDARIO]]`). El servidor la quita del texto y la manda en el evento `done`.
- El navegador guarda un **Focus pendiente** (`lib/focus-store.ts`, localStorage) y empieza a pedir la
  lección en ese momento (`POST /api/focus/lesson`), para que esté lista al llegar.
- Al terminar de hablar, el chat avisa y a los 3 s lleva a la pestaña **Focus**. Mientras haya un Focus
  pendiente, el chat queda bloqueado: abrir la pestaña Tocorito te devuelve a Focus. El calendario sigue libre.
- Lección: 3–5 pasos, con un tiempo mínimo de lectura por paso (en total ≥ 2 min).
- Prueba: 3 preguntas de opción múltiple con datos parecidos (no iguales). Las falladas vuelven al final;
  se termina cuando aciertas todas.
- La lección la genera la misma IA del chat (sin servicios nuevos ni costo extra aparte de los tokens).

## Límites conocidos

- En la web, borrar los datos del navegador quita el bloqueo. Con cuentas, el Focus pendiente irá al servidor.
- Imágenes de la tarea "lista para entregar": **pendiente**. Necesita un servicio de generación de
  imágenes (ni Claude local ni el chat actual las crean) y tiene costo por imagen; se decide aparte.
