# 0011 — Entrenamiento SAT Reading and Writing

**Estado:** aceptada (v2, correcciones del 2026-10-27). Especificaciones de producto (del dueño):
`Prompt_Tocorito_SAT_Claude.md` y `Prompt_Correcciones_Tocorito_Claude.md`.

## Qué es oficial y qué es de Tocorito

- **Oficial (College Board):** las 4 áreas y 11 familias del Digital SAT Reading and Writing; 54 preguntas (50 puntuables),
  64 min, 1,19 min/pregunta; pasajes de 25–150 "palabras estandarizadas" (caracteres ÷ 6); bandas de complejidad de
  textos (grados 6–8, 9–11, 12–14); dificultad easy/medium/hard; gráficos solo tablas, barras y líneas, sin cálculos.
  Fuente: *Assessment Framework for the Digital SAT Suite* (PDF, tablas 8 y 10) consultado el 2026-10-26.
- **De Tocorito (producto):** microobjetivos y su orden, rondas, reinicio total por un error, temporizadores y fase de
  velocidad (hasta 60 s TOTALES para 50 preguntas). Las rondas de 50 **no** son simulacros oficiales, nada se convierte
  en puntuación SAT y superar el minuto final **no** es requisito ni garantía de nada.

## Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Temario | `lib/sat/curriculum.ts` | 11 familias, **67** microobjetivos (inventario comprobado por prueba), rúbrica 1–8 |
| Configuración | `lib/sat/config.ts` | Tamaños, dificultad por nivel, tiempos, **presupuesto de IA** (variables de entorno) |
| Planificador | `lib/sat/planner.ts` | A1 → B1 → A2…, repaso acumulativo, 11 familias, ≤ 50, **repasos aplazados** |
| Preguntas | `lib/sat/items.ts` | Validación, palabras estandarizadas, duplicados textual/estructural/aproximado/**paráfrasis** |
| Lecciones | `lib/sat/lessons.ts` | Comprobaciones automáticas (codificación, erratas tipo "sssola", ejemplo en inglés, brevedad…) |
| Referencias | `lib/sat/references.ts` | Registro de referencias oficiales y celdas **sin** referencia; bandas esperadas |
| Motor | `lib/sat/engine.ts` | Respuestas idempotentes, reinicio, reloj, victoria, **defectos sin borrar intentos**, auditoría |
| Unión | `lib/sat/merge.ts` | Unir historiales al vincular dispositivos |
| IA | `lib/server/sat-ai.ts` | Generar; revisar **sin clave y a ciegas de dificultad**; lecciones y su revisión; impugnar |
| Servicio | `lib/server/sat-service.ts` | Estado por sujeto, candados entre procesos, búfer, presupuesto, métricas, reportes |
| Identidad | `lib/server/device-link.ts` | Vincular dispositivos con código de un solo uso |
| API | `app/api/sat/route.ts` | GET estado; POST start/reveal/answer/ack/restore/report/link-create/link-redeem |
| Pantalla | `app/sat/page.tsx` + `components/sat/` | Lección + pregunta, reloj, cobertura, reinicio, vinculación, progreso |
| Pruebas | `lib/sat/*.test.ts`, `lib/server/sat-service.test.ts` | Motor y servicio integral con IA falsa y reloj controlado |

## Decisiones (configurables)

- **Niveles:** 21, 26, 31, 36, 41, 46, 50, 50, 50, 50; dificultad 1, 2, 2, 3, 3, 4, 4, 5, 6, 7. El nivel 1 presenta las
  11 familias; luego 10 microobjetivos nuevos por nivel (todos enseñados antes de la banda avanzada). Si un repaso no cabe
  (p. ej. el de F11.1 en el nivel 1), queda **pendiente** y entra en la ronda siguiente hasta acertarlo.
- **Lecciones:** no se muestran sin estado `validated`. Proceso: comprobaciones automáticas → revisión de IA separada
  (exactitud, ejemplos, español, microobjetivo y prerrequisitos, brevedad, simplificaciones con excepciones, no resolver
  preguntas) → si falla, se reescribe con los problemas como guía (hasta 3) → versión nueva. Las guardadas antes de esta
  versión pasan a `pending` y se revisan antes de volver a mostrarse. Las lecciones se pueden repetir; las preguntas no.
- **Dificultad frente al SAT real:**
  - *Alineación de contenido (hecha ahora):* la revisión ciega (sin saber el nivel pretendido) compara cada pregunta con
    las especificaciones oficiales y los rasgos de las muestras oficiales de su familia, puntúa 8 dimensiones (sintaxis y
    densidad, vocabulario, relaciones, evidencia, distractores, alcance de la conclusión, datos, tiempo) y estima la banda
    (fundamentos / easy / medium / hard / por encima). Se acepta con ±1 banda de lo pretendido; en la banda avanzada solo
    "hard" o "por encima". Se guardan razones y desacuerdos (motivos de rechazo).
  - *Calibración estadística (pendiente):* requiere datos de muchos estudiantes. Se instrumenta por pregunta (mostrada,
    aciertos, fallos, tiempo) en `item-stats.json`, sin asignar dificultad por un acierto o fallo aislado.
- **Puerta de velocidad:** 50/50, dificultad de ronda ≥ 6, banda "hard"/"por encima" confirmada en **cada** pregunta,
  las 11 familias, todo enseñado y todo nuevo. Si falta la banda revisada, sube de nivel pero **no** abre la velocidad.
- **Reportes:** reportar solo **registra**: no pausa, no da acierto ni cobertura, no completa la posición ni da tiempo.
  Una revisión independiente (solo pregunta y clave; el texto del reporte **no** se le pasa) decide en segundo plano:
  - válida → nada cambia (si había reinicio, se mantiene y se explica la regla);
  - defectuosa y abierta → se sustituye en la misma posición (hay que responderla); el tiempo pasado en la pregunta
    inválida no cuenta;
  - defectuosa y acertada en la ronda actual → ese acierto se anula y la posición se vuelve a pedir al final;
  - defectuosa y causó el reinicio → el reinicio se anula en métricas; si no has empezado nada después, vuelve tu ronda;
    si ya seguiste, se **ofrece** recuperarla sin borrar lo posterior (eventos, no copias que pisan).
- **Identidad y dispositivos:** con cuentas (Supabase) el historial es del usuario. Sin cuentas: invitado por dispositivo
  (avisado en pantalla) o **dispositivos vinculados** con un código de 8 caracteres, un solo uso, 10 min, 5 intentos.
  Al vincular: unión de vistas, intentos y métricas sumados (cada historial se une una vez y luego se borra), y queda el
  progreso más avanzado. Un dispositivo ya vinculado a otra cuenta no se une (no arrastrar historiales ajenos).
- **Sin repetir:** pasaje normalizado, esqueleto (nombres/cifras), MinHash solo del pasaje, y Jaccard de raíces de
  contenido para paráfrasis. Mismo enunciado estándar + mismas opciones (is/are/was/were) **no** basta para descartar.
  Se comprueba al reservar, al mostrar (dentro del candado) y al unir historiales. Es probabilístico: no hay garantía absoluta.
- **Presupuesto:** `SAT_DAILY_CALLS` (por estudiante y día, por defecto 1500 llamadas), `SAT_GLOBAL_DAILY_CALLS`
  (servidor, opcional), `SAT_PRICE_IN_PER_MTOK` / `SAT_PRICE_OUT_PER_MTOK` (si faltan, coste "no calculable").
  Se cuentan llamadas y tokens; métricas separadas de generadas, rechazadas (con motivo y por familia), disponibles,
  reservadas, mostradas, tiempo por llamada y esperas reales. Si un lote no deja nada, esa habilidad espera cada vez más.
  Al agotarse: aviso y espera, sin cronómetro ni fallo.
- **Persistencia:** `SAT_DATA_DIR` (por defecto `web/.data/sat`, fuera de git, no temporal). Candado de archivo entre
  procesos + escritura atómica; el historial de vistas nunca se borra (ni al reiniciar ni al podar preguntas viejas).
- **Herramientas de prueba:** IA falsa y reloj controlado solo en pruebas; `/api/dev/identity` (solo `next dev` en
  localhost) cambia el navegador a una identidad de prueba y la restaura, sin saber respuestas.

## Limitaciones reales que siguen

- **Referencias por dificultad:** el Student Question Bank (único material oficial con etiqueta easy/medium/hard e IDs)
  exige iniciar sesión en College Board: no se pudo consultar. Las 33 celdas familia × dificultad están registradas como
  "sin referencia". Para completarlas hace falta que el dueño acceda con su cuenta y respete sus condiciones de uso.
- **Despliegue:** no hay despliegue real todavía (Railway pendiente). En un contenedor sin volumen persistente los
  archivos se perderían: hará falta un volumen o la base de datos. Con varias máquinas, los candados de archivo no bastan:
  hace falta una base de datos con transacciones.
- **Teléfono real:** el servidor de desarrollo solo escucha en esta computadora; para probar en el teléfono hay que
  arrancarlo accesible en la red local (`next dev -H 0.0.0.0`) o desplegarlo.
- Sin embeddings: la detección de paráfrasis es por raíces de palabras, no semántica profunda.
- Las revisiones por IA reducen errores; no son infalibles.
- No hay cambio de idioma de las explicaciones (la app aún no tiene esa función).
