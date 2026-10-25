# 0010 — Focus en tres partes: Escuela, Cursos y Libre

**Estado:** aceptada (amplía ADR 0009)

## Contexto

El dueño definió tres partes para Focus:
1. **Escuela**: las clases reales del estudiante (cuando la app pueda ver Canvas u otra app de la escuela).
2. **Cursos**: el estudiante le dice a Tocorito qué quiere aprender y Tocorito le genera un curso.
3. **Libre**: lecciones de cosas educativas que no son de una clase ni de un curso.

## Decisión

- Pestañas arriba en Focus (se recuerda la última en el dispositivo). Nombres en español, como el resto de la app.
- **Escuela vs Libre** sin pedirle nada nuevo a Tocorito: una clase es de la escuela si su nombre sale en el
  calendario (Canvas o anotaciones con materia). Todo lo demás (incluido "General") va a Libre.
  Ambas usan el mismo mapa de columnas (ADR 0009). La lección obligatoria sigue igual, esté donde esté.
- **Cursos**:
  - `POST /api/focus/course` genera solo el **índice** (3–5 unidades × 3–4 lecciones). Si el tema no es
    apropiado para 13+, Tocorito responde un rechazo corto y no se crea nada.
  - `POST /api/focus/course/lesson` genera cada lección (pasos + mini test) **la primera vez que se abre**
    y se guarda: no se paga dos veces y no se generan lecciones que nadie abre.
  - Desbloqueo en orden como Duolingo; el trofeo de cada unidad (prueba de la unidad) usa la misma IA de
    los repasos con las lecciones de esa unidad. Sin cuenta atrás: el estudiante eligió aprenderlo.
  - Camino en zigzag con banners por unidad y Tocorito junto a la lección que toca.
  - Guardado en el dispositivo (`tocorito.focus.courses.v1`); con cuentas irá a la base de datos.

## Costo

Sin servicios ni dependencias nuevas. Gasta tokens de IA: 1 llamada por curso (índice) + 1 por lección
abierta + 1 por prueba de unidad. Un curso completo de 15 lecciones ≈ 20 llamadas. Contar en los límites por plan.

## Pendiente

- Conectar Canvas de verdad para Escuela (hoy sale del calendario/feed .ics).
- Cursos en la base de datos y sincronizados entre dispositivos.
