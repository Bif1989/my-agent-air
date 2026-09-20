"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import BrandMark from "@/app/components/brand-mark";
import { FormEvent, useEffect, useState } from "react";
import { resendSignupOtp, saveSession, signUp, verifySignupOtp } from "@/lib/supabase-auth";

const agentTypes = ["Aviakassa", "Turagent", "Turoperator", "Boshqa"];

function maskEmail(email: string) {
  const [localPart, domainPart] = email.split("@");
  if (!localPart || !domainPart) return email;
  const visible = localPart.slice(0, 2);
  return `${visible}***@${domainPart}`;
}

export default function RegisterPage() {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const router = useRouter();

  useEffect(() => {
    track("signup_started");
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((previous) => (previous <= 1 ? 0 : previous - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    if (password !== String(formData.get("passwordConfirmation") || "")) {
      setError("Parollar bir xil bo‘lishi kerak.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await signUp({
        email,
        password,
        full_name: String(formData.get("fullName") || ""),
        company_name: String(formData.get("company") || ""),
        phone: String(formData.get("phone") || ""),
        city: String(formData.get("city") || ""),
        agent_type: String(formData.get("agentType") || ""),
      });
      if (response.access_token && response.refresh_token && response.user?.id) {
        track("signup_completed");
        saveSession(response);
        router.push("/dashboard");
        return;
      }
      setPendingEmail(email);
      setOtpCode("");
      setResendCooldown(60);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ro‘yxatdan o‘tishda xatolik yuz berdi.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(otpCode)) {
      setError("6 xonali kodni kiriting.");
      return;
    }

    setIsVerifying(true);
    try {
      const response = await verifySignupOtp(pendingEmail, otpCode);
      track("signup_completed");
      saveSession(response);
      router.push("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Kodni tasdiqlashda xatolik yuz berdi.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResendOtp() {
    if (!pendingEmail || resendCooldown > 0 || isResending) return;
    setError("");
    setIsResending(true);
    try {
      await resendSignupOtp(pendingEmail);
      setResendCooldown(60);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Kod yuborishda xatolik yuz berdi.");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f8fc] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-blue-900/10 lg:grid-cols-[0.72fr_1.28fr]">
        <aside className="relative hidden overflow-hidden bg-[#0b1f3a] p-10 text-white lg:flex lg:flex-col lg:justify-between"><Link href="/" className="relative flex items-center gap-3 text-sm font-semibold tracking-wide"><BrandMark /> MY AGENT AIR</Link><div className="relative"><p className="text-sm font-medium text-cyan-300">BIRGALIKDA KO‘PROQ IMKONIYAT</p><h2 className="mt-4 text-4xl font-semibold leading-tight">Sizning tarmog‘ingiz. Sizning kelishuvlaringiz.</h2><p className="mt-5 leading-7 text-blue-100">Yangi hamkorlarni toping, so‘rov yuboring va aviatsiya biznesini tezroq rivojlantiring.</p></div><p className="relative text-sm text-blue-200">Find • Connect • Deal</p></aside>
        <section className="p-6 sm:p-10 lg:p-14">
          <Link href="/" className="flex w-fit items-center gap-3 text-sm font-semibold tracking-wide text-[#0b1f3a] lg:hidden"><BrandMark /> MY AGENT AIR</Link>
          <div className="mt-10 lg:mt-0"><p className="text-sm font-medium text-blue-600">Yangi hisob</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#0b1f3a]">Tarmoqqa qo‘shiling</h1><p className="mt-3 text-sm leading-6 text-slate-500">Professional agentlar bilan ishlashni bugun boshlang.</p></div>

          {pendingEmail ? (
            <form onSubmit={handleVerifyOtp} className="mt-8 grid gap-5">
              <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">Emailingizga yuborilgan 6 xonali kodni kiriting: <span className="font-semibold">{maskEmail(pendingEmail)}</span></p>
              <label className="block text-sm font-medium text-slate-700">Tasdiqlash kodi<input required name="otp" type="text" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" placeholder="123456" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 text-center text-xl tracking-[0.35em] outline-none transition placeholder:tracking-normal placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
              {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={isVerifying || otpCode.length !== 6} className="rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-100">{isVerifying ? "Tasdiqlanmoqda..." : "Tasdiqlash"}</button>
              <button type="button" onClick={handleResendOtp} disabled={resendCooldown > 0 || isResending} className="rounded-xl border border-slate-200 bg-white py-3.5 font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-100">
                {isResending ? "Yuborilmoqda..." : resendCooldown > 0 ? `Kodni qayta yuborish (${resendCooldown}s)` : "Kodni qayta yuborish"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Ism va familiya<input required name="fullName" type="text" placeholder="Masalan: Ilhom Bakiyev" autoComplete="name" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
              <label className="block text-sm font-medium text-slate-700">Kompaniya / aviakassa nomi<input required name="company" type="text" autoComplete="organization" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
              <label className="block text-sm font-medium text-slate-700">Telefon raqami (+998)<input required name="phone" type="tel" placeholder="+998 90 123 45 67" autoComplete="tel" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
              <label className="block text-sm font-medium text-slate-700">Email<input required name="email" type="email" placeholder="agent@example.com" autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
              <label className="block text-sm font-medium text-slate-700">Shahar<input required name="city" type="text" placeholder="Toshkent" autoComplete="address-level2" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
              <label className="block text-sm font-medium text-slate-700">Agent turi<select required name="agentType" defaultValue="" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="" disabled>Agent turini tanlang</option>{agentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="block text-sm font-medium text-slate-700">Parol<input required name="password" type="password" minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
              <label className="block text-sm font-medium text-slate-700">Parolni tasdiqlash<input required name="passwordConfirmation" type="password" minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
              <label className="flex items-start gap-3 text-sm text-slate-500 sm:col-span-2"><input required name="terms" type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" /><span>Platformadan foydalanish shartlariga roziman.</span></label>
              {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">{error}</p>}
              <button type="submit" disabled={isLoading} className="rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-100 sm:col-span-2">{isLoading ? "Ro‘yxatdan o‘tilmoqda..." : "Ro‘yxatdan o‘tish"}</button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">Akkauntingiz bormi? <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">Kirish</Link></p>
        </section>
      </div>
    </main>
  );
}
