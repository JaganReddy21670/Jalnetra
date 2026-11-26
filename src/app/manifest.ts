import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/brand";

/** Web app manifest: makes JalNetra installable (Android, iPhone "Add to Home Screen", the APK). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${APP_NAME}: Water network monitoring`,
    short_name: APP_NAME,
    description: "Daily field inspections for water monitoring devices: check every node, report offline reasons, see uptime and maps.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#EEF1F7",
    theme_color: "#007AFF",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
