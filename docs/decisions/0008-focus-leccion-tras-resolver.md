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

## Imagen de la solución (añadido)

- Se desbloquea al terminar el Focus: botón "Guardar imagen de la solución".
- Se dibuja en el dispositivo con `<canvas>` (`lib/solution-image.ts`): sin IA de imágenes, sin dependencias,
  **costo $0**, y el texto es exactamente el que escribió Tocorito. Las fórmulas LaTeX se pasan a símbolos (x², √, ½…).
- Descartado: IA de imágenes (GPT Image, Gemini/Nano Banana): ~$0.03–0.21 por imagen y se equivocan
  con números y fórmulas. Descartado también `html-to-image`: depende de `foreignObject`, que falla en Safari/iPhone.
- En el móvil abre el menú Compartir (Guardar en Fotos); si no hay, descarga el PNG. En la app nativa
  (Capacitor) habrá que usar su plugin de compartir/archivos.
