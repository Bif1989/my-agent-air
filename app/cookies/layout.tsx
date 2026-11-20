import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie sozlamalari | My Agent Air",
  alternates: { canonical: "/cookies" },
};

export default function CookieLayout({ children }: { children: React.ReactNode }) {
  return children;
}
