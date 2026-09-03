import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { BackgroundField } from "@/components/background-field";

import "./globals.css";

export const metadata: Metadata = {
  title: "AI Agent Observatory",
  description:
    "Local-first behavioral observability for AI coding agents. Measures observable agent behavior, not model weights.",
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-[100dvh] font-sans antialiased">
        <BackgroundField />
        {children}
      </body>
    </html>
  );
}
