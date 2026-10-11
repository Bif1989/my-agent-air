import RecoveryRedirect from "@/app/components/recovery-redirect";
import PwaInstall from "@/app/components/pwa-install";
import PwaSplash from "@/app/components/pwa-splash";
import AiVoiceLoader from "@/app/components/ai-voice-loader";
import VkLaunchAuth from "@/app/components/vk-launch-auth";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  applicationName: "My Agent Air",
  description: "Aviakassa, turagent va turoperatorlar uchun AI, Geo-Tender, so‘rov, taklif va bitim platformasi.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/my-agent-air-icon.svg",
    apple: "/my-agent-air-maskable.svg",
  },
  appleWebApp: { capable: true, title: "My Agent Air", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b1f3a",
  viewportFit: "cover",
};

const preferenceScript = `
try {
  const locale = localStorage.getItem('my-agent-air:locale');
  const theme = localStorage.getItem('my-agent-air:theme');
  if (locale === 'ru' || locale === 'uz') document.documentElement.lang = locale;
  const resolvedTheme = theme === 'dark' || theme === 'light' ? theme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  document.documentElement.dataset.theme = resolvedTheme;
  const standalone = matchMedia('(display-mode: standalone)').matches || Boolean(navigator.standalone);
  document.documentElement.dataset.pwaStandalone = standalone ? 'true' : 'false';
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
          <PwaSplash />
          <RecoveryRedirect />
          <VkLaunchAuth />
          {children}
          <AiVoiceLoader />
          <PwaInstall />
        </UiSettingsProvider>
      </body>
    </html>
  );
}
