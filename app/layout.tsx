import RecoveryRedirect from "@/app/components/recovery-redirect";
import PwaInstall from "@/app/components/pwa-install";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import VkMiniAppBridge from "@/app/components/vk-mini-app-bridge";
import { UiSettingsProvider } from "@/lib/ui-settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "My Agent Air — Travel Agent B2B Platform",
  applicationName: "Agent Bifavia",
  description: "Aviakassa va turizm agentlari uchun so‘rov, taklif, bitim va hamkorlik platformasi.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/my-agent-air-icon.svg",
    apple: "/my-agent-air-maskable.svg",
  },
  appleWebApp: { capable: true, title: "Agent Bifavia", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport = { themeColor: "#0b1f3a" };

const preferenceScript = `
try {
  const locale = localStorage.getItem('my-agent-air:locale');
  const theme = localStorage.getItem('my-agent-air:theme');
  if (locale === 'ru' || locale === 'uz') document.documentElement.lang = locale;
  const resolvedTheme = theme === 'dark' || theme === 'light' ? theme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  document.documentElement.dataset.theme = resolvedTheme;
} catch {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="uz"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head><script dangerouslySetInnerHTML={{ __html: preferenceScript }} /></head>
      <body className="min-h-full flex flex-col">
        <UiSettingsProvider>
          <VkMiniAppBridge />
          <RecoveryRedirect />{children}
          <PwaInstall />
          <Analytics />
        </UiSettingsProvider>
      </body>
    </html>
  );
}
