import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AuthGate from "@/components/auth/AuthGate";
import ReminderCenter from "@/components/ReminderCenter";
import TabBar from "@/components/TabBar";
import "katex/dist/katex.min.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Study App",
  description: "Asistente de estudio con IA",
};

// Pensado para móvil: ocupa toda la pantalla (también bajo el notch) y colorea la barra del sistema.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d3bb5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-black antialiased`}>
        {/* Sin sesión: pantalla de inicio de sesión. Con sesión: la app (pantalla + pestañas abajo). */}
        <AuthGate>
          <div className="flex h-dvh flex-col overflow-hidden">
            <div className="min-h-0 flex-1">{children}</div>
            <TabBar />
          </div>
          <ReminderCenter />
        </AuthGate>
      </body>
    </html>
  );
}
