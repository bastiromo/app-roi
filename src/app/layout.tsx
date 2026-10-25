import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { THEME_SCRIPT } from "@/components/theme-switch";
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
    { media: "(prefers-color-scheme: light)", color: "#ebeae6" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: el script de tema agrega data-theme antes de que React hidrate
    <html lang="es-CL" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
