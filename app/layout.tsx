import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "My Agent Air — Travel Agent B2B Platform",
  description: "Aviakassa va turizm agentlari uchun so‘rov, taklif, bitim va hamkorlik platformasi.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "My Agent Air", statusBarStyle: "black-translucent" },
};

export const viewport = { themeColor: "#0b1f3a" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="uz"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
