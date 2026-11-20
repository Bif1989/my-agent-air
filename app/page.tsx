import type { Metadata } from "next";
import LandingPage from "@/app/components/landing-page";

const title = "My Agent Air | O‘zbekiston turizm hamkorlari uchun B2B platforma";
const description = "Turagentlar, turoperatorlar, mehmonxonalar, gidlar va transport hamkorlarini toping, so‘rov yuboring va takliflarni bir joyda solishtiring.";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "My Agent Air",
    url: "/",
    title,
    description,
  },
  twitter: { card: "summary", title, description },
};

export default function HomePage() {
  return <LandingPage />;
}
