import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "App ROI", template: "%s · App ROI" },
  description: "Costos, payouts y ROI real de tus cuentas de fondeo.",
  applicationName: "App ROI",
  appleWebApp: { capable: true, title: "App ROI", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf0f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1726" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={GeistSans.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
