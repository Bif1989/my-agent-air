import Link from "next/link";
import AppShell from "@/app/dashboard/components/app-shell";

export default function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <AppShell activePath={description}>
      <section className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
        <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm sm:px-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-blue-600">✦</div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">My Agent Air</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a]">{title}</h1>
          <p className="mx-auto mt-4 max-w-md leading-7 text-slate-500">Bu bo‘lim keyingi bosqichda ishga tushiriladi. Platformaning asosiy ish paneli hozir tayyor.</p>
          <Link href="/dashboard" className="mt-8 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Dashboardga qaytish</Link>
        </div>
      </section>
    </AppShell>
  );
}
