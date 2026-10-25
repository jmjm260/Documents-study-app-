# 0009 — Mapa de cursos en Focus (estilo Duolingo)

**Estado:** aceptada (v1: parte "Cursos"; la parte "Tareas" se define más adelante)

## Contexto

La lista de lecciones de Focus no daba sensación de avance. El dueño quiere un mapa como el de
Duolingo, pero propio: Tocorito arriba con líneas a cada curso, los cursos uno al lado del otro, y
debajo de cada uno su camino. Tocorito resuelve las tareas; al estudiante le toca aprenderlas.

## Decisión

- `lib/focus-map.ts` (lógica pura, con pruebas) arma las columnas a partir de lo que ya hay:
  lecciones guardadas, repasos, la lección pendiente y el calendario (Canvas + anotaciones).
  El nombre del curso sale primero del calendario; las lecciones se juntan con él sin tildes ni mayúsculas.
- Círculos:
  - **gris (candado)**: tarea del curso que Tocorito aún no resolvió → "Pedírsela a Tocorito" abre el chat con la petición escrita.
  - **rojo ("Tu lección")**: Tocorito la resolvió; falta la mini lección y el mini test.
  - **color del curso (✓)**: lección y test hechos → repetir, ver o guardar la imagen.
  - **trofeo**: examen. Con repaso, lo abre; si hay lecciones del curso pero no repaso, "Preparar repaso".
- Exámenes de Canvas: llegan como evento; se reconocen por el título (examen, parcial, quiz, final…).
- Solo se ve de 2 semanas atrás a 60 días adelante (Canvas trae todo el semestre). Lo hecho con Tocorito, siempre.
- Cualquier número de cursos: 1–3 se reparten el ancho; 4 o más se deslizan de lado y las líneas se recalculan.
  Colores por orden alfabético, distintos entre cursos (hasta 7).
- Con una lección obligatoria pendiente se puede mirar el mapa, pero solo lleva de vuelta a ella.
- `components/focus/CourseMap.tsx`: Tocorito de cuerpo entero tomando café cada ~9 s; líneas en SVG.

## Pendiente

- Parte "Tareas" (preguntas sueltas que no son de un curso).
- v2: unir cada tarea de Canvas con la lección que salió de ella (hoy salen como círculos separados).
- Notificaciones ("Vence mañana", "Tu repaso está listo").
