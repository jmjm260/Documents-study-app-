# 0001 — No usar la API oficial de Canvas como base

**Estado:** aceptada

## Contexto

La API de Canvas exige claves de desarrollador emitidas por cada institución, y muchas
escuelas bloquean los tokens personales de acceso. Un producto vendido directo al
estudiante no puede depender de acuerdos con cada escuela.

## Decisión

Detección mediante el feed iCal (y luego correos de notificación); enriquecimiento
mediante canales que el estudiante autoriza (extensión, navegador integrado, captura).

## Consecuencias

- Funciona en cualquier escuela sin acuerdos.
- Datos incompletos al principio → necesitamos los niveles de contexto.
- Hay que validar con una cuenta real qué trae exactamente el `.ics` (fase 2).
