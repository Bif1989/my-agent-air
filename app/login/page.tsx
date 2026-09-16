import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#f4f8fc] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-blue-900/10 sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative hidden overflow-hidden bg-[#0b1f3a] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[36px] border-cyan-300/20" />
          <div className="relative">
            <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-wide"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg font-bold text-[#0f4c81]">M</span> MY AGENT AIR</Link>
            <div className="mt-28 max-w-sm"><p className="text-sm font-medium text-cyan-300">TRAVEL AGENT NETWORK</p><h2 className="mt-4 text-4xl font-semibold leading-tight">Hamkorlikning keyingi manzili.</h2><p className="mt-5 leading-7 text-blue-100">O‘zbekiston bo‘ylab ishonchli aviakassa va turizm agentlari bilan bir platformada ishlang.</p></div>
          </div>
          <p className="relative text-sm text-blue-200">Find • Connect • Deal</p>
        </aside>
        <section className="flex items-center justify-center p-6 sm:p-12 lg:p-16">
          <div className="w-full max-w-md">
            <Link href="/" className="flex w-fit items-center gap-3 text-sm font-semibold tracking-wide text-[#0b1f3a] lg:hidden"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">M</span> MY AGENT AIR</Link>
            <div className="mt-10 lg:mt-0"><p className="text-sm font-medium text-blue-600">Xush kelibsiz</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#0b1f3a]">Platformaga kirish</h1><p className="mt-3 text-sm leading-6 text-slate-500">Agentlar tarmog‘idagi ish maydoningizga qayting.</p></div>
            <form className="mt-8 space-y-5">
              <label className="block text-sm font-medium text-slate-700">Telefon raqami (+998)<input required name="phone" type="tel" placeholder="+998 90 123 45 67" autoComplete="tel" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
              <label className="block text-sm font-medium text-slate-700">Parol<input required name="password" type="password" autoComplete="current-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
              <button type="submit" className="w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Kirish</button>
            </form>
            <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm"><Link href="#" className="font-medium text-blue-600 hover:text-blue-700">Parolni unutdingizmi?</Link><Link href="/register" className="font-medium text-blue-600 hover:text-blue-700">Ro‘yxatdan o‘tish</Link></div>
          </div>
        </section>
      </div>
    </main>
  );
}
