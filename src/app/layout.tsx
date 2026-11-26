import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { SessionProvider } from "@/components/session";
import "./globals.css";
import { APP_NAME } from "@/lib/brand";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "JalNetra: eyes on every water node, every day. Daily field device checks, map, uptime and reports.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#EEF1F7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
