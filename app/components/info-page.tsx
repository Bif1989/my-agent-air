import Link from "next/link";

export default function InfoPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-50 px-5 py-10"><article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-10"><Link href="/dashboard" className="text-sm font-semibold text-blue-600">← My Agent Air</Link><h1 className="mt-6 text-3xl font-semibold text-[#0b1f3a]">{title}</h1><div className="mt-6 space-y-5 text-sm leading-7 text-slate-600">{children}</div><nav className="mt-8 flex flex-wrap gap-5 border-t border-slate-100 pt-5 text-sm text-blue-600"><Link href="/terms">Foydalanish shartlari</Link><Link href="/privacy">Maxfiylik</Link><Link href="/help">Yordam</Link></nav></article></main>;
}
