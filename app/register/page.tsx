import Link from "next/link";

const agentTypes = ["Aviakassa", "Turagent", "Turoperator", "Boshqa"];

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-[#f4f8fc] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-blue-900/10 lg:grid-cols-[0.72fr_1.28fr]">
        <aside className="relative hidden overflow-hidden bg-[#0b1f3a] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full border-[36px] border-cyan-300/20" />
          <Link href="/" className="relative flex items-center gap-3 text-sm font-semibold tracking-wide"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg font-bold text-[#0f4c81]">M</span> MY AGENT AIR</Link>
          <div className="relative"><p className="text-sm font-medium text-cyan-300">BIRGALIKDA KO‘PROQ IMKONIYAT</p><h2 className="mt-4 text-4xl font-semibold leading-tight">Sizning tarmog‘ingiz. Sizning kelishuvlaringiz.</h2><p className="mt-5 leading-7 text-blue-100">Yangi hamkorlarni toping, so‘rov yuboring va aviatsiya biznesini tezroq rivojlantiring.</p></div>
          <p className="relative text-sm text-blue-200">Find • Connect • Deal</p>
        </aside>
        <section className="p-6 sm:p-10 lg:p-14">
          <Link href="/" className="flex w-fit items-center gap-3 text-sm font-semibold tracking-wide text-[#0b1f3a] lg:hidden"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">M</span> MY AGENT AIR</Link>
          <div className="mt-10 lg:mt-0"><p className="text-sm font-medium text-blue-600">Yangi hisob</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#0b1f3a]">Tarmoqqa qo‘shiling</h1><p className="mt-3 text-sm leading-6 text-slate-500">Professional agentlar bilan ishlashni bugun boshlang.</p></div>
          <form className="mt-8 grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Ism va familiya<input required name="fullName" type="text" placeholder="Masalan: Ilhom Bakiyev" autoComplete="name" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
            <label className="block text-sm font-medium text-slate-700">Kompaniya / aviakassa nomi<input required name="company" type="text" autoComplete="organization" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
            <label className="block text-sm font-medium text-slate-700">Telefon raqami (+998)<input required name="phone" type="tel" placeholder="+998 90 123 45 67" autoComplete="tel" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
            <label className="block text-sm font-medium text-slate-700">Shahar<input required name="city" type="text" placeholder="Toshkent" autoComplete="address-level2" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Agent turi<select required name="agentType" defaultValue="" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="" disabled>Agent turini tanlang</option>{agentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="block text-sm font-medium text-slate-700">Parol<input required name="password" type="password" minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
            <label className="block text-sm font-medium text-slate-700">Parolni tasdiqlash<input required name="passwordConfirmation" type="password" minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
            <label className="flex items-start gap-3 text-sm text-slate-500 sm:col-span-2"><input required name="terms" type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" /><span>Platformadan foydalanish shartlariga roziman.</span></label>
            <button type="submit" className="rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 sm:col-span-2">Ro‘yxatdan o‘tish</button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">Akkauntingiz bormi? <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">Kirish</Link></p>
        </section>
      </div>
    </main>
  );
}