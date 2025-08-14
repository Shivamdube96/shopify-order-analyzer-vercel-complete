// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";                    // <- THIS is required for Tailwind styles
import { Analytics } from "@vercel/analytics/react";
// Optional:
// import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "Shopify Order Analyzer",
  description: "Analyze Shopify order exports in your browser",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        {/* <SpeedInsights /> */}
      </body>
    </html>
  );
}
