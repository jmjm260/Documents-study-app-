// Prepara las fotos en el dispositivo antes de mandarlas: las reduce (lado mayor 1600 px) y las
// pasa a JPEG. Así pesan poco (~200-600 KB), suben rápido y cuestan menos a la IA.
// Las fotos no se guardan en ningún servidor: van directas a la IA para esta respuesta.

export const MAX_SIDE = 1600;
/** Miniatura para guardar en el historial (las fotos grandes no caben en el dispositivo). */
export const THUMB_SIDE = 320;

export async function compressImage(file: File, maxSide = MAX_SIDE, quality = 0.85): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Eso no es una imagen.");
  let bitmap: ImageBitmap;
  try {
    // "from-image" respeta la orientación de las fotos del móvil (EXIF).
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("No pude abrir esa foto. Prueba con JPG o PNG.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No pude preparar la foto.");
  ctx.fillStyle = "#fff"; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
