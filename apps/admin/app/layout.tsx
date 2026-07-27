import "./globals.css";

export const metadata = {
  title: "Control Room · Los 5 Apóstoles",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
