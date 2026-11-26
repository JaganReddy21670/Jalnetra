import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { SessionProvider } from "@/components/session";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";
import { APP_NAME } from "@/lib/brand";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "JalNetra: eyes on every water node, every day. Daily field device checks, map, uptime and reports.",
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#007AFF" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <SessionProvider>
          <RegisterSW />
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
