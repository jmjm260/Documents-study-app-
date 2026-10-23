# 0005 — Fotos en el chat (Tocorito resuelve ejercicios de una foto)

**Estado:** aceptada

## Contexto

El dueño quiere que el estudiante mande fotos (ejercicios, páginas, pizarra) y que Tocorito
dé las respuestas, o explique si se lo piden. La opción debe ser simple y limpia.

## Decisión

- **Interfaz**: botón **+** a la izquierda de la barra de mensaje (en el móvil abre cámara o
  galería con `<input type="file" accept="image/*">`, que también funciona en Capacitor). Se puede
  pegar una captura con Ctrl+V. Hasta 4 fotos, con miniaturas y ✕ antes de enviar; tocar una foto
  del chat la abre a pantalla completa.
- **En el dispositivo** cada foto se reduce (lado mayor 1600 px) y pasa a JPEG (`web/src/lib/images.ts`).
- **API**: `ChatMessage.images` (data URLs). Solo el último mensaje lleva fotos a la IA; las
  anteriores se cambian por una marca de texto para no gastar de más. Validación de tipo y tamaño.
- **Proveedores**: OpenAI recibe partes `image_url`; Claude local recibe bloques `image` base64.
- **Tocorito**: si manda una foto de ejercicios (o pide las respuestas), resuelve cada uno con la
  respuesta en negrita y una o dos líneas de cómo se llega. Si algo no se lee, lo dice; no inventa.
  Un "dame las respuestas" ya no cuenta como "no quiero estudiar".

## Consecuencias

- Las fotos **no se guardan** en ningún servidor: van a la IA para esa respuesta y viven solo en
  la pantalla del chat.
- Las fotos se envían al proveedor de IA: pueden salir caras o nombres. Tocorito no los comenta;
  revisar con `minor-privacy` antes de abrir a menores.
- Coste: una foto cuesta bastantes más tokens que un texto; contar en `recordUsage` cuando haya límites.
- Cambia la regla anterior de "no hacer la tarea por el estudiante": ahora da respuestas si se las piden.
