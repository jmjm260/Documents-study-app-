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
  - Sin esperas para el estudiante: al crear el curso, la **primera lección ya viene lista**; y mientras
    lee una lección, Tocorito prepara **en segundo plano** la siguiente (y la prueba de la unidad si es la
    última). Cada diapositiva de explicación pide **20 s mínimo** la primera vez (leer y entender, y le da
    tiempo a Tocorito); las preguntas no esperan, y al repetir una lección hecha tampoco.
  - **Investigación previa** (razonamiento alto): antes del índice, Tocorito escribe un "Plan de Tocorito"
    (objetivo realista, punto de partida, ruta, práctica, errores típicos, tiempo) y el índice lo sigue.
    Es con lo que sabe el modelo: **no busca en internet** (eso sería un servicio nuevo con costo, a decidir).
  - **Desde el chat**: si el estudiante quiere aprender algo, Tocorito le ofrece un curso; si acepta, escribe
    `[[CURSO]]{tema, nivel, objetivo, contexto}` con un resumen de lo hablado (sin datos personales) y la app
    lo crea **en segundo plano** (aviso en el chat → "Abrir"). Desde Focus, "Nuevo curso" también va en segundo plano.
  - El curso queda "creándose" hasta que su primera lección está lista; si se cierra la app a mitad, pasa a
    "falló" (con Reintentar). Si el tema no es apto, queda "rechazado" con la frase de Tocorito.
  - Desbloqueo en orden como Duolingo; el trofeo de cada unidad (prueba de la unidad) usa la misma IA de
    los repasos con las lecciones de esa unidad.
  - Camino en zigzag con banners por unidad y Tocorito junto a la lección que toca.
  - Guardado en el dispositivo (`tocorito.focus.courses.v1`); con cuentas irá a la base de datos.

## Costo

Sin servicios ni dependencias nuevas. Gasta tokens de IA: 2 llamadas al crear (investigación con
razonamiento alto + índice) + 1 por lección + 1 por prueba de unidad. Un curso de 20 lecciones ≈ 27 llamadas.
Contar en los límites por plan.

## Pendiente

- Conectar Canvas de verdad para Escuela (hoy sale del calendario/feed .ics).
- Cursos en la base de datos y sincronizados entre dispositivos.
