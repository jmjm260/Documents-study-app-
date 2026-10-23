"use client";

// Lista de chats con Tocorito: abrir uno, empezar uno nuevo o borrar.
import { useState } from "react";
import Sheet from "@/components/Sheet";
import { TrashIcon } from "@/components/chat/ActionCard";
import { whenLabel, type Conversation } from "@/lib/conversations";

export default function ChatsSheet({
  conversations,
  currentId,
  onOpen,
  onNew,
  onDelete,
  onClose,
}: {
  conversations: Conversation[];
  currentId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <Sheet title="Tus chats" onClose={onClose} dark>
      <button
        onClick={onNew}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1450d8] text-[15px] font-bold text-white active:bg-[#0d3bb5]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
        Nuevo chat
      </button>

      {conversations.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Todavía no tienes chats guardados.</p>
      ) : (
        <ul className="mt-3 divide-y divide-white/10 pb-2">
          {conversations.map((c) => (
            <li key={c.id} className="flex items-center gap-1">
              {confirming === c.id ? (
                <div className="flex min-h-14 flex-1 items-center justify-between gap-2 py-2">
                  <span className="text-sm text-slate-300">¿Borrar este chat?</span>
                  <span className="flex gap-1">
                    <button onClick={() => setConfirming(null)} className="min-h-10 rounded-full px-3 text-sm font-semibold text-slate-300 active:bg-white/10">
                      No
                    </button>
                    <button
                      onClick={() => {
                        onDelete(c.id);
                        setConfirming(null);
                      }}
                      className="min-h-10 rounded-full bg-[#e5262b] px-4 text-sm font-bold text-white"
                    >
                      Borrar
                    </button>
                  </span>
                </div>
              ) : (
                <>
                  <button onClick={() => onOpen(c.id)} className="flex min-h-14 min-w-0 flex-1 flex-col justify-center py-2 text-left active:opacity-70">
                    <span className={`truncate text-[15px] font-semibold ${c.id === currentId ? "text-[#6ea0ff]" : "text-white"}`}>{c.title}</span>
                    <span className="text-xs text-slate-500">
                      {whenLabel(c.updatedAt)} · {c.messages.filter((m) => m.role !== "action").length} mensajes
                    </span>
                  </button>
                  <button
                    onClick={() => setConfirming(c.id)}
                    aria-label={`Borrar chat ${c.title}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:text-red-400 active:bg-white/10"
                  >
                    <TrashIcon className="h-[18px] w-[18px]" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
