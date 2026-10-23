"use client";

// Tocorito de cuerpo entero (sin círculo). Tiene dos poses que se cruzan:
// "idle" (taza en la mano) y "sip" (tomando café). Con `sipping` hace la animación del sorbo.
import Image from "next/image";

const RATIO = 352 / 440; // ancho / alto de las imágenes

export default function TocoritoFigure({
  height,
  sipping = false,
  breathe = true,
  priority = false,
  className = "",
}: {
  height: number;
  sipping?: boolean;
  breathe?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const width = Math.round(height * RATIO);
  return (
    <div
      className={`relative shrink-0 ${sipping ? "tocorito-sip" : breathe ? "tocorito-breathe" : ""} ${className}`}
      style={{ width, height }}
      aria-hidden
    >
      <Image
        src="/tocorito-idle.webp"
        alt=""
        width={width}
        height={height}
        priority={priority}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${sipping ? "opacity-0" : "opacity-100"}`}
      />
      <Image
        src="/tocorito-sip.webp"
        alt=""
        width={width}
        height={height}
        priority={priority}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${sipping ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
