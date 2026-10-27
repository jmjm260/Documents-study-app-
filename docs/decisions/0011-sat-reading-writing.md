# 0011 — Entrenamiento SAT Reading and Writing

**Estado:** aceptada (v1). Especificación de producto: `Prompt_Tocorito_SAT_Claude.md` (del dueño).

## Qué es oficial y qué es de Tocorito

- **Oficial (College Board):** las 4 áreas y 11 familias de habilidades del Digital SAT Reading and Writing,
  preguntas de 4 opciones con una mejor respuesta. Ver satsuite.collegeboard.org (referencias del documento).
- **De Tocorito (decisiones de producto):** microobjetivos y su orden, rondas, reinicio total por un error,
  temporizadores y fase de velocidad. Las rondas de 50 **no** son simulacros oficiales (el SAT real: 54 preguntas,
  64 min, dos módulos) y nada se convierte en una puntuación SAT.

## Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Temario | `lib/sat/curriculum.ts` | 11 familias, 67 microobjetivos con prerrequisitos, rúbrica de dificultad 1–8 |
| Configuración | `lib/sat/config.ts` | Tamaños de ronda, dificultad por nivel, 60 s/pregunta, escalones de tiempo, límites de coste |
| Planificador | `lib/sat/planner.ts` | A1 → B1 → A2 …, repaso acumulativo ponderado por lo que costó, 11 familias por ronda, ≤ 50 |
| Preguntas | `lib/sat/items.ts` | Formato, validación determinista, huellas y duplicados, vista pública sin clave |
| Motor | `lib/sat/engine.ts` | Respuestas idempotentes, reinicio, reloj del servidor, condición de victoria, fase de velocidad |
| IA | `lib/server/sat-ai.ts` | Generación (lotes), **revisión independiente sin clave**, microlecciones, impugnación |
| Servicio | `lib/server/sat-service.ts` | Estado por usuario en `.data/sat/`, cola por usuario, búfer en segundo plano |
| API | `app/api/sat/route.ts` | GET estado; POST start / reveal / answer / ack / report |
| Pantalla | `app/sat/page.tsx` + `components/sat/` | Lección + "Empezar pregunta", elegir y confirmar, reloj, cobertura, reinicio, progreso |

## Decisiones de implementación (configurables en `config.ts`)

- Niveles: 21, 26, 31, 36, 41, 46, 50, 50, 50, 50 preguntas; dificultad 1, 2, 2, 3, 3, 4, 4, 5, 6, 7.
  El nivel 1 presenta las 11 familias (un microobjetivo de cada una); luego 10 microobjetivos nuevos por nivel.
  Todos se enseñan antes de la banda avanzada.
- **Banda avanzada:** dificultad ≥ 6. La reducción de tiempo solo empieza tras un 50/50 con dificultad ≥ 6, las 11 familias,
  todos los microobjetivos enseñados y todas las preguntas nuevas. Escalones: 50, 45, … 5, 1 min (mínimo 60 s TOTALES).
- **Tiempo:** en rondas < 50, 60 s por pregunta desde "Empezar pregunta" (leer la lección no cuenta). En rondas de 50,
  presupuesto global que suma solo el tiempo con una pregunta abierta. Marcas de tiempo del servidor, margen de 2,5 s.
  Recargar o cambiar de pestaña no renueva nada. Agotar el tiempo cuenta como fallo.
- **Reinicio:** cualquier error confirmado → nivel 1, ronda nueva, preguntas nuevas; se conservan lo visto (ids y huellas),
  las métricas y lo que costó. Se explica el error (correcta, por qué, por qué no la tuya, regla/evidencia).
- **Seleccionar ≠ enviar:** se elige y se confirma; cada confirmación lleva un `nonce` y se procesa una sola vez.
- **Claves:** solo en el servidor. El navegador recibe la pregunta sin clave ni explicaciones; se califica comparando con la clave validada.
- **Validación antes de usar:** estructura, 4 opciones distintas, clave A–D, razón por distractor, inglés, familia y banda,
  gráfico coherente; luego una **revisión por IA separada** que resuelve la pregunta sin ver la clave (razonamiento alto) y
  la descarta si su respuesta no coincide, si hay ambigüedad, falta información o no evalúa la habilidad.
- **Sin repetir:** huellas de pasaje, enunciado+opciones (en cualquier orden), esqueleto (nombres → `nname`, cifras → `nnum`)
  y similitud aproximada (MinHash de trigramas). Se comprueba al reservar **y** al mostrar. Lo generado y nunca mostrado no cuenta como visto.
- **Búfer:** las próximas 6 posiciones, las 4 primeras del nivel 1 (para un reinicio) y el comienzo de la ronda siguiente.
  Las rondas de 50 sin lecciones no se pueden empezar sin sus 50 preguntas reservadas.
- **Fallos técnicos** (IA, red, desincronización) no son errores académicos: aviso y reintento.
- **Pregunta defectuosa:** "Reportar" la retira y pone otra sin castigo. "Revisarla" tras un reinicio pide una revisión
  independiente; si era defectuosa, se deshace el reinicio. Todo reporte queda en `.data/sat/reports.jsonl`.
- Coste: lotes de 3–4 preguntas por llamada + 1 revisión por lote; tope 400 preguntas nuevas por usuario y día.

## Limitaciones reales (v1)

- **Sin cuentas** todavía: progreso e historial "sin repetir" son por dispositivo (cookie). Entre dispositivos hace falta login.
- La similitud semántica es aproximada (no hay embeddings): detecta variantes superficiales, no todas las reescrituras.
- La rúbrica de dificultad **no está calibrada** con ejemplos oficiales ni con datos de uso; las etiquetas son de la IA
  según la rúbrica. Calibrar cuando haya datos.
- Las **microlecciones no pasan por revisión** (puede haber erratas); se guardan y reutilizan.
- Los trabajos en segundo plano corren dentro del servidor de Next: en producción hará falta una cola/worker.
- Preparar 50 preguntas validadas tarda varios minutos con Claude local; se adelanta durante la ronda anterior.
- No hay cambio de idioma de las explicaciones (la app aún no tiene esa función).
