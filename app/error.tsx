"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#eef5fb] px-6 text-center"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600">Xatolik</p><h1 className="mt-3 text-3xl font-semibold text-[#0b1f3a]">Sahifani yuklab bo‘lmadi</h1><p className="mt-3 text-sm text-slate-500">Kutilmagan xatolik yuz berdi. Qayta urinib ko‘ring.</p><button type="button" onClick={reset} className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-100">Qayta urinish</button></div></main>;
}