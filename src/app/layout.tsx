import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Los 5 Apostoles",
  description: "Dashboard interno de oportunidades y respuestas asistidas para PC MIDI Center."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="font-body">
        <div className="grain" />
        {children}
      </body>
    </html>
  );
}

