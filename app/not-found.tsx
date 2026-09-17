import Link from "next/link";

export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-[#eef5fb] px-6 text-center"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">404</p><h1 className="mt-3 text-3xl font-semibold text-[#0b1f3a]">Sahifa topilmadi</h1><p className="mt-3 text-sm text-slate-500">Bu manzil mavjud emas yoki ko‘chirilgan.</p><Link href="/dashboard" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-100">Dashboardga qaytish</Link></div></main>;
}