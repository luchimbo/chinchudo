import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PC MIDI Suite",
  description: "Dashboard unificado: oportunidades, landings SEO, leads, distribución y GEO para PC MIDI Center."
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

