"use client";

// Globo de diálogo junto a Tocorito. Está anclado por la derecha (junto a él), así que al escribirse
// crece hacia la izquierda y luego hacia arriba. Tocarlo termina el mensaje al instante.
import { forwardRef } from "react";
import RichText from "@/components/RichText";
import { typingSafe } from "@/lib/stream-text";

const SpeechBubble = forwardRef<HTMLButtonElement, { text: string; waitingLabel: string | null; onSkip: () => void }>(
  function SpeechBubble({ text, waitingLabel, onSkip }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onSkip}
        aria-live="polite"
        aria-label={text ? undefined : waitingLabel ?? "Tocorito está escribiendo"}
        className="speech-in pointer-events-auto relative block w-fit max-w-full cursor-default rounded-[20px] rounded-br-md border-[1.5px] border-white/90 bg-black px-4 py-2.5 text-left text-[15px] leading-relaxed text-white"
      >
        {text ? (
          <span className="block max-h-[45vh] overflow-y-auto whitespace-pre-wrap break-words">
            <RichText text={typingSafe(text)} />
            <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-white" aria-hidden />
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/80" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
            {waitingLabel && <span className="text-xs font-medium text-slate-300">{waitingLabel}</span>}
          </span>
        )}
        {/* Piquito del globo apuntando a Tocorito */}
        <span className="absolute -right-[7px] bottom-2 h-3 w-3 rotate-45 rounded-[2px] border-r-[1.5px] border-t-[1.5px] border-white/90 bg-black" aria-hidden />
      </button>
    );
  }
);

export default SpeechBubble;
