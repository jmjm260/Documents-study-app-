"use client";

// Si las cuentas están activadas y no hay sesión, enseña la pantalla de inicio de sesión en vez de la app.
// También ofrece { email, signOut } a cualquier componente (p. ej. el panel de chats).
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import TocoritoFigure from "@/components/chat/TocoritoFigure";
import LoginScreen from "./LoginScreen";

type Session = { email: string | null; signOut: () => Promise<void> } | null;
const SessionContext = createContext<Session>(null);
export const useSession = () => useContext(SessionContext);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "open" | "login" | "in">("loading");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(async (data: { configured: boolean; user: { email: string | null } | null }) => {
        if (!data.configured) return setState("open"); // modo desarrollo sin cuentas
        if (!data.user) return setState("login");
        setEmail(data.user.email);
        setState("in");
        // Chats que este dispositivo tenía sin cuenta → pasan a la cuenta (una vez por sesión).
        try {
          if (!sessionStorage.getItem("tocorito.importedDevice")) {
            const res = await fetch("/api/conversations/import-device", { method: "POST" });
            const { imported } = await res.json();
            sessionStorage.setItem("tocorito.importedDevice", "1");
            if (imported > 0) window.location.reload();
          }
        } catch {
          // se intentará en la próxima sesión
        }
      })
      .catch(() => setState("open"));
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    try {
      localStorage.removeItem("tocorito.currentChat");
      sessionStorage.removeItem("tocorito.importedDevice");
    } catch {
      // sin almacenamiento
    }
    window.location.href = "/";
  }, []);

  if (state === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-black">
        <TocoritoFigure height={120} priority />
      </div>
    );
  }
  if (state === "login") return <LoginScreen />;
  return <SessionContext.Provider value={state === "in" ? { email, signOut } : null}>{children}</SessionContext.Provider>;
}
