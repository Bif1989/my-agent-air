import Link from "next/link";
import BrandMark from "./brand-mark";

export const authInputClass = "mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
export const authButtonClass = "w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-100";

export default function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f8fc] px-4 py-8"><section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-blue-900/10 sm:p-9"><Link href="/" className="flex items-center gap-3 text-sm font-semibold text-[#0b1f3a]"><BrandMark /> MY AGENT AIR</Link><h1 className="mt-8 text-2xl font-semibold text-[#0b1f3a]">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{description}</p><div className="mt-7">{children}</div><Link href="/login" className="mt-6 block text-center text-sm font-semibold text-blue-600">Kirish sahifasiga qaytish</Link></section></main>;
}
