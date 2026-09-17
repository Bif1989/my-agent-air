import Link from "next/link";
import BrandMark from "@/app/components/brand-mark";

const features = [
  { name: "Exchange", description: "Parvoz va xizmatlar bo‘yicha so‘rovlarni bir joyda boshqaring.", icon: "↔" },
  { name: "Agent Chat", description: "Ishonchli hamkorlar bilan tez va qulay bog‘laning.", icon: "◌" },
  { name: "Deals", description: "Kelishuvlarni aniq shartlar va tarix bilan yuriting.", icon: "◇" },
  { name: "Agent Network", description: "O‘zbekiston bo‘ylab professional agentlar tarmog‘ini kashf eting.", icon: "⌁" },
];

export default function Home() {
  return (
    <main className="overflow-hidden">
      <section className="relative isolate bg-[#0b1f3a] text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_20%,rgba(56,189,248,0.28),transparent_35%),linear-gradient(120deg,#0b1f3a_15%,#0f4c81_100%)]" />
        <div className="mx-auto max-w-7xl px-6 pb-20 pt-6 lg:px-10 lg:pb-28">
          <nav className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3" aria-label="My Agent Air bosh sahifa"><BrandMark /><span className="text-sm font-semibold tracking-wide sm:text-base">MY AGENT AIR</span></Link>
            <div className="flex items-center gap-3 text-sm"><Link href="/login" className="rounded-full px-4 py-2.5 text-slate-200 transition hover:bg-white/10 hover:text-white">Kirish</Link><Link href="/register" className="rounded-full bg-white px-4 py-2.5 font-semibold text-[#0f4c81] shadow-lg shadow-cyan-950/20 transition hover:bg-cyan-50">Ro‘yxatdan o‘tish</Link></div>
          </nav>
          <div className="grid items-center gap-14 pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:pt-28">
            <div><p className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-white/10 px-4 py-2 text-xs font-medium tracking-wide text-cyan-100"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> O‘zbekiston agentlari uchun yangi hamkorlik maydoni</p><h1 className="max-w-3xl text-5xl font-semibold leading-[1.06] tracking-tight sm:text-6xl lg:text-7xl">Travel agentlar uchun yangi parvoz nuqtasi</h1><p className="mt-7 max-w-xl text-lg leading-8 text-blue-100">Aviakassa va turizm agentlari uchun professional B2B platforma. Hamkor toping, taklif almashing va kelishuvlarni ishonch bilan yakunlang.</p><div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/register" className="inline-flex items-center justify-center gap-3 rounded-full bg-cyan-300 px-6 py-3.5 font-semibold text-[#09213d] transition hover:bg-cyan-200">Tarmoqqa qo‘shilish <span aria-hidden="true">→</span></Link><Link href="/login" className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3.5 font-semibold text-white transition hover:bg-white/10">Platformaga kirish</Link></div></div>
            <div className="relative mx-auto w-full max-w-md lg:mr-0"><div className="absolute -inset-8 rounded-[3rem] bg-cyan-300/10 blur-3xl" /><div className="relative rounded-[2rem] border border-white/20 bg-white/10 p-5 shadow-2xl backdrop-blur-xl"><div className="rounded-[1.4rem] bg-white p-6 text-[#0b1f3a] shadow-xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Platforma imkoniyatlari</p><h2 className="mt-3 text-2xl font-semibold">Hamkorlikni bir joyda boshqaring</h2><div className="mt-6 space-y-4">{[["01", "Agentlarni toping", "Faol hamkorlarni xizmatlari bo‘yicha qidiring."], ["02", "Taklif almashing", "So‘rovlar va takliflarni aniq shartlar bilan yuriting."], ["03", "Bitimni yakunlang", "Qabul qilingan takliflar asosida xavfsiz ish jarayonini davom ettiring."]].map(([number, title, description]) => <div key={number} className="flex gap-3 rounded-xl bg-slate-50 p-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-700">{number}</span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div></div>)}</div></div></div></div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28"><div className="max-w-2xl"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Qanday ishlaydi</p><h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Bir necha qadamda yangi hamkorlik</h2></div><div className="mt-12 grid gap-3 md:grid-cols-5">{["Agentlarni toping", "Bog‘laning", "So‘rov yuboring", "Taklif oling", "Kelishuv qiling"].map((step, index) => <div key={step} className="relative border-t-2 border-blue-100 pt-5 md:border-t-0 md:border-l-2 md:pl-5"><span className="text-sm font-semibold text-blue-500">0{index + 1}</span><p className="mt-2 font-semibold text-[#0b1f3a]">{step}</p></div>)}</div></section>
      <section className="border-y border-blue-100 bg-white"><div className="mx-auto max-w-7xl px-6 py-20 lg:px-10"><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{features.map((feature) => <div key={feature.name} className="rounded-2xl border border-slate-100 bg-[#f7fbff] p-6 transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-100/40"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl text-white">{feature.icon}</span><h3 className="mt-6 font-semibold text-[#0b1f3a]">{feature.name}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{feature.description}</p></div>)}</div></div></section>
      <footer className="bg-[#0b1f3a] px-6 py-8 text-sm text-blue-100"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 sm:flex-row sm:items-center"><span className="font-semibold text-white">MY AGENT AIR</span><span>My Agent Air — Find • Connect • Deal</span></div></footer>
    </main>
  );
}