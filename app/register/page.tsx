"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import BrandMark from "@/app/components/brand-mark";
import { UiControls, useUiSettings } from "@/lib/ui-settings";
import { AGENT_TYPES } from "@/lib/profile-completion";
import { FormEvent, useEffect, useState } from "react";
import { saveSession } from "@/lib/supabase-auth";
import { resendSignupOtpProtected, signUpProtected, verifySignupOtpProtected } from "@/lib/public-auth";

const MIN_PASSWORD_LENGTH = 10;

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
  const { isRu } = useUiSettings();

  useEffect(() => { track("signup_started"); }, []);
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((previous) => previous <= 1 ? 0 : previous - 1), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(isRu ? `Пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов.` : `Parol kamida ${MIN_PASSWORD_LENGTH} belgidan iborat bo‘lsin.`);
      return;
    }
    if (password !== String(formData.get("passwordConfirmation") || "")) {
      setError(isRu ? "Пароли должны совпадать." : "Parollar bir xil bo‘lishi kerak.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await signUpProtected({
        email,
        password,
        full_name: String(formData.get("fullName") || "").trim(),
        company_name: String(formData.get("company") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        city: String(formData.get("city") || "").trim(),
        agent_type: String(formData.get("agentType") || "").trim(),
      });
      if (response.access_token && response.refresh_token && response.user?.id) {
        track("signup_completed");
        saveSession(response);
        router.push("/profile?complete=1");
        return;
      }
      setPendingEmail(email);
      setOtpCode("");
      setResendCooldown(60);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (isRu ? "Ошибка при регистрации." : "Ro‘yxatdan o‘tishda xatolik yuz berdi."));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(otpCode)) {
      setError(isRu ? "Введите 6-значный код." : "6 xonali kodni kiriting.");
      return;
    }
    setIsVerifying(true);
    try {
      const response = await verifySignupOtpProtected(pendingEmail, otpCode);
      track("signup_completed");
      saveSession(response);
      router.push("/profile?complete=1");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (isRu ? "Ошибка подтверждения кода." : "Kodni tasdiqlashda xatolik yuz berdi."));
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResendOtp() {
    if (!pendingEmail || resendCooldown > 0 || isResending) return;
    setError("");
    setIsResending(true);
    try {
      await resendSignupOtpProtected(pendingEmail);
      setResendCooldown(60);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (isRu ? "Ошибка отправки кода." : "Kod yuborishda xatolik yuz berdi."));
    } finally {
      setIsResending(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  return (
    <main className="min-h-screen bg-[#f4f8fc] px-4 py-4 sm:px-6 sm:py-6">
      <div className="fixed right-4 top-4 z-50"><UiControls /></div>
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-blue-900/10 lg:grid-cols-[0.72fr_1.28fr]">
        <aside className="relative hidden overflow-hidden bg-[#0b1f3a] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <Link href="/" className="relative flex items-center gap-3 text-sm font-semibold tracking-wide"><BrandMark /> MY AGENT AIR</Link>
          <div className="relative">
            <p className="text-sm font-medium text-cyan-300">{isRu ? "БОЛЬШЕ ВОЗМОЖНОСТЕЙ ВМЕСТЕ" : "BIRGALIKDA KO‘PROQ IMKONIYAT"}</p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight">{isRu ? "Ваша сеть. Ваши сделки." : "Sizning tarmog‘ingiz. Sizning kelishuvlaringiz."}</h2>
            <p className="mt-5 leading-7 text-blue-100">{isRu ? "Находите новых партнёров, отправляйте запросы и развивайте туристический бизнес быстрее." : "Yangi hamkorlarni toping, so‘rov yuboring va turizm biznesini tezroq rivojlantiring."}</p>
          </div>
          <p className="relative text-sm text-blue-200">Find • Connect • Deal</p>
        </aside>

        <section className="p-6 sm:p-10 lg:p-14">
          <Link href="/" className="flex w-fit items-center gap-3 text-sm font-semibold tracking-wide text-[#0b1f3a] lg:hidden"><BrandMark /> MY AGENT AIR</Link>
          <div className="mt-10 lg:mt-0">
            <p className="text-sm font-medium text-blue-600">{isRu ? "Новый аккаунт" : "Yangi hisob"}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#0b1f3a]">{isRu ? "Присоединяйтесь к сети" : "Tarmoqqa qo‘shiling"}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">{isRu ? "Заполните данные компании и подтвердите email, чтобы появиться в каталоге агентов." : "Agentlar ro‘yxatida chiqish uchun ma’lumotlarni to‘ldiring va emailingizni tasdiqlang."}</p>
          </div>

          {pendingEmail ? (
            <form onSubmit={handleVerifyOtp} className="mt-8 grid gap-5">
              <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">{isRu ? "Введите 6-значный код, отправленный на email:" : "Emailingizga yuborilgan 6 xonali kodni kiriting:"} <span className="font-semibold">{maskEmail(pendingEmail)}</span></p>
              <label className="block text-sm font-medium text-slate-700">{isRu ? "Код подтверждения" : "Tasdiqlash kodi"}<input required name="otp" type="text" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" placeholder="123456" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 text-center text-xl tracking-[0.35em] outline-none transition placeholder:tracking-normal placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
              {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={isVerifying || otpCode.length !== 6} className="rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-100">{isVerifying ? (isRu ? "Подтверждение..." : "Tasdiqlanmoqda...") : (isRu ? "Подтвердить" : "Tasdiqlash")}</button>
              <button type="button" onClick={handleResendOtp} disabled={resendCooldown > 0 || isResending} className="rounded-xl border border-slate-200 bg-white py-3.5 font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-100">{isResending ? (isRu ? "Отправка..." : "Yuborilmoqda...") : resendCooldown > 0 ? `${isRu ? "Отправить код повторно" : "Kodni qayta yuborish"} (${resendCooldown}s)` : (isRu ? "Отправить код повторно" : "Kodni qayta yuborish")}</button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">{isRu ? "Имя и фамилия" : "Ism va familiya"}<input required name="fullName" type="text" placeholder={isRu ? "Например: Илхом Бакиев" : "Masalan: Ilhom Bakiyev"} autoComplete="name" className={inputClass} /></label>
              <label className="block text-sm font-medium text-slate-700">Email<input required name="email" type="email" placeholder="agent@example.com" autoComplete="email" className={inputClass} /></label>

              <label className="block text-sm font-medium text-slate-700">{isRu ? "Компания / бренд" : "Kompaniya / brend"}<input required name="company" type="text" placeholder={isRu ? "Название компании" : "Kompaniya nomi"} autoComplete="organization" className={inputClass} /></label>
              <label className="block text-sm font-medium text-slate-700">{isRu ? "Телефон" : "Telefon"}<input required name="phone" type="tel" placeholder="+998 90 123 45 67" autoComplete="tel" className={inputClass} /></label>

              <label className="block text-sm font-medium text-slate-700">{isRu ? "Город" : "Shahar"}<input required name="city" type="text" placeholder={isRu ? "Например: Наманган" : "Masalan: Namangan"} autoComplete="address-level2" className={inputClass} /></label>
              <label className="block text-sm font-medium text-slate-700">{isRu ? "Тип партнёра" : "Agent turi"}<select required name="agentType" defaultValue="" className={`${inputClass} bg-white`}><option value="" disabled>{isRu ? "Выберите" : "Tanlang"}</option>{AGENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>

              <label className="block text-sm font-medium text-slate-700">{isRu ? "Пароль" : "Parol"}<input required name="password" type="password" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className={inputClass} /></label>
              <label className="block text-sm font-medium text-slate-700">{isRu ? "Повторите пароль" : "Parolni tasdiqlash"}<input required name="passwordConfirmation" type="password" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className={inputClass} /></label>

              <label className="flex items-start gap-3 text-sm text-slate-500 sm:col-span-2"><input required name="terms" type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" /><span>{isRu ? "Я ознакомился и согласен с " : ""}<Link href="/terms" target="_blank" className="text-blue-600 underline">{isRu ? "условиями использования" : "Foydalanish shartlari"}</Link>{isRu ? " и " : " va "}<Link href="/privacy" target="_blank" className="text-blue-600 underline">{isRu ? "политикой конфиденциальности" : "maxfiylik qoidalari"}</Link>{isRu ? "." : " bilan tanishdim va roziman."}</span></label>
              {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">{error}</p>}
              <button type="submit" disabled={isLoading} className="rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-100 sm:col-span-2">{isLoading ? (isRu ? "Регистрация..." : "Ro‘yxatdan o‘tilmoqda...") : (isRu ? "Зарегистрироваться" : "Ro‘yxatdan o‘tish")}</button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">{isRu ? "Уже есть аккаунт?" : "Akkauntingiz bormi?"} <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">{isRu ? "Войти" : "Kirish"}</Link></p>
        </section>
      </div>
    </main>
  );
}
