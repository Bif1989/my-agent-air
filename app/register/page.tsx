"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import BrandMark from "@/app/components/brand-mark";
import TurnstileChallenge, { TURNSTILE_SITE_KEY } from "@/app/components/turnstile-challenge";
import { UiControls, useUiSettings } from "@/lib/ui-settings";
import { saveSession } from "@/lib/supabase-auth";
import {
  completeSignupSmsProtected,
  requestSignupSmsProtected,
  resendSignupOtpProtected,
  resendSignupSmsProtected,
  signUpProtected,
  verifySignupOtpProtected,
  verifySignupSmsProtected,
} from "@/lib/public-auth";

const MIN_PASSWORD_LENGTH = 10;
type SignupMethod = "phone" | "email";
type PendingVerification =
  | { method: "phone"; identifier: string; password: string; challengeId: string }
  | { method: "email"; identifier: string };

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return phone;
  return `+${digits.slice(0, 3)} ** *** ${digits.slice(-4, -2)} ${digits.slice(-2)}`;
}

export default function RegisterPage() {
  const [method, setMethod] = useState<SignupMethod>("phone");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [pending, setPending] = useState<PendingVerification | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const router = useRouter();
  const { isRu } = useUiSettings();
  const captchaRequired = Boolean(TURNSTILE_SITE_KEY);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((value) => value <= 1 ? 0 : value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  function resetCredentials(nextMethod = method) {
    setMethod(nextMethod);
    setPending(null);
    setOtpCode("");
    setError("");
    setResendCooldown(0);
    setCaptchaToken("");
    setCaptchaReset((value) => value + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const identifier = String(formData.get("identifier") || "").trim();
    const password = String(formData.get("password") || "");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(isRu ? `Пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов.` : `Parol kamida ${MIN_PASSWORD_LENGTH} belgidan iborat bo‘lsin.`);
      return;
    }
    if (captchaRequired && !captchaToken) {
      setError(isRu ? "Завершите проверку безопасности." : "Xavfsizlik tekshiruvini yakunlang.");
      return;
    }

    setIsLoading(true);
    try {
      if (method === "phone") {
        const response = await requestSignupSmsProtected(identifier, password, captchaToken);
        if (!response.challenge_id) throw new Error(isRu ? "Не удалось отправить SMS-код." : "SMS kodni yuborib bo‘lmadi.");
        setPending({ method: "phone", identifier, password, challengeId: response.challenge_id });
      } else {
        const response = await signUpProtected({ email: identifier, password, captcha_token: captchaToken });
        if (response.access_token && response.refresh_token && response.user?.id) {
          saveSession(response);
          router.replace("/profile?complete=1");
          return;
        }
        setPending({ method: "email", identifier: identifier.toLowerCase() });
      }
      setOtpCode("");
      setResendCooldown(60);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (isRu ? "Ошибка регистрации." : "Ro‘yxatdan o‘tishda xatolik yuz berdi."));
      if (captchaRequired) setCaptchaReset((value) => value + 1);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) return;
    setError("");
    if (!/^\d{6}$/.test(otpCode)) {
      setError(isRu ? "Введите 6-значный код." : "6 xonali kodni kiriting.");
      return;
    }

    setIsVerifying(true);
    try {
      if (pending.method === "phone") {
        await verifySignupSmsProtected(pending.challengeId, pending.identifier, otpCode);
        const response = await completeSignupSmsProtected({ phone: pending.identifier, password: pending.password }, pending.challengeId);
        if (response.access_token && response.refresh_token && response.user?.id) {
          saveSession(response);
          router.replace("/profile?complete=1");
          return;
        }
      } else {
        const response = await verifySignupOtpProtected(pending.identifier, otpCode);
        if (response.access_token && response.refresh_token && response.user?.id) {
          saveSession(response);
          router.replace("/profile?complete=1");
          return;
        }
      }
      router.replace("/login");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (isRu ? "Ошибка подтверждения кода." : "Kodni tasdiqlashda xatolik yuz berdi."));
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResendOtp() {
    if (!pending || resendCooldown > 0 || isResending) return;
    setError("");
    setIsResending(true);
    try {
      if (pending.method === "phone") await resendSignupSmsProtected(pending.challengeId, pending.identifier);
      else await resendSignupOtpProtected(pending.identifier);
      setOtpCode("");
      setResendCooldown(60);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (isRu ? "Не удалось отправить код повторно." : "Kodni qayta yuborib bo‘lmadi."));
    } finally {
      setIsResending(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  return (
    <main className="min-h-screen bg-[#f4f8fc] px-4 py-4 sm:px-6 sm:py-6">
      <div className="fixed right-4 top-4 z-50"><UiControls /></div>
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-blue-900/10 sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="relative hidden overflow-hidden bg-[#0b1f3a] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <Link href="/" className="relative flex items-center gap-3 text-sm font-semibold tracking-wide"><BrandMark /> MY AGENT AIR</Link>
          <div className="relative">
            <p className="text-sm font-medium text-cyan-300">{isRu ? "БЫСТРАЯ РЕГИСТРАЦИЯ" : "TEZKOR RO‘YXATDAN O‘TISH"}</p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight">{isRu ? "Сначала аккаунт. Затем профиль." : "Avval hisob. Keyin profil."}</h2>
            <p className="mt-5 leading-7 text-blue-100">{isRu ? "Подтвердите телефон или email за пару шагов. Данные компании заполните уже после входа." : "Telefon yoki emailni ikki qadamda tasdiqlang. Kompaniya ma’lumotlarini kirgandan keyin to‘ldirasiz."}</p>
          </div>
          <p className="relative text-sm text-blue-200">Find • Connect • Deal</p>
        </aside>

        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <Link href="/" className="flex w-fit items-center gap-3 text-sm font-semibold tracking-wide text-[#0b1f3a] lg:hidden"><BrandMark /> MY AGENT AIR</Link>
            <div className="mt-10 lg:mt-0">
              <p className="text-sm font-medium text-blue-600">{pending ? (isRu ? "Шаг 2 из 2" : "2-bosqich / 2") : (isRu ? "Шаг 1 из 2" : "1-bosqich / 2")}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#0b1f3a]">{pending ? (isRu ? "Подтвердите код" : "Kodni tasdiqlang") : (isRu ? "Создать аккаунт" : "Hisob ochish")}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">{pending
                ? (isRu ? "После подтверждения вы войдёте в аккаунт и заполните анкету компании." : "Tasdiqlagach hisobga kirasiz va kompaniya anketasini to‘ldirasiz.")
                : (isRu ? "Нужны только телефон или email и пароль. Остальные данные — после подтверждения." : "Hozir faqat telefon yoki email va parol kerak. Qolgan ma’lumotlar tasdiqlashdan keyin.")}</p>
            </div>

            {pending ? (
              <form onSubmit={handleVerifyOtp} className="mt-8 grid gap-5">
                <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  {pending.method === "phone"
                    ? (isRu ? "6-значный код отправлен на:" : "6 xonali kod yuborildi:")
                    : (isRu ? "6-значный код отправлен на email:" : "6 xonali kod emailga yuborildi:")} {" "}
                  <span className="font-semibold">{pending.method === "phone" ? maskPhone(pending.identifier) : pending.identifier}</span>
                </p>
                <label className="block text-sm font-medium text-slate-700">{isRu ? "Код подтверждения" : "Tasdiqlash kodi"}
                  <input required name="otp" type="text" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" placeholder="123456" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3.5 text-center text-xl tracking-[0.35em] outline-none transition placeholder:tracking-normal placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                </label>
                {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                <button type="submit" disabled={isVerifying || otpCode.length !== 6} className="rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-100">{isVerifying ? (isRu ? "Подтверждение..." : "Tasdiqlanmoqda...") : (isRu ? "Подтвердить и продолжить" : "Tasdiqlash va davom etish")}</button>
                <button type="button" onClick={handleResendOtp} disabled={resendCooldown > 0 || isResending} className="rounded-xl border border-slate-200 bg-white py-3.5 font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-100">{isResending ? (isRu ? "Отправка..." : "Yuborilmoqda...") : resendCooldown > 0 ? `${isRu ? "Отправить повторно" : "Kodni qayta yuborish"} (${resendCooldown}s)` : (isRu ? "Отправить повторно" : "Kodni qayta yuborish")}</button>
                <button type="button" onClick={() => resetCredentials(pending.method)} className="text-sm font-medium text-slate-500 hover:text-blue-700">{isRu ? "Изменить телефон / email или пароль" : "Telefon / email yoki parolni o‘zgartirish"}</button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                  <button type="button" onClick={() => resetCredentials("phone")} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${method === "phone" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{isRu ? "Телефон" : "Telefon"}</button>
                  <button type="button" onClick={() => resetCredentials("email")} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${method === "email" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>Email</button>
                </div>

                <label className="block text-sm font-medium text-slate-700">{method === "phone" ? (isRu ? "Номер телефона" : "Telefon raqami") : "Email"}
                  <input required name="identifier" type={method === "phone" ? "tel" : "email"} inputMode={method === "phone" ? "tel" : "email"} placeholder={method === "phone" ? "+998 90 123 45 67" : "agent@example.com"} autoComplete={method === "phone" ? "tel" : "email"} className={inputClass} />
                </label>
                <label className="block text-sm font-medium text-slate-700">{isRu ? "Пароль" : "Parol"}
                  <input required name="password" type="password" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className={inputClass} />
                  <span className="mt-2 block text-xs leading-5 text-slate-400">{isRu ? `Минимум ${MIN_PASSWORD_LENGTH} символов. Небезопасный пароль будет отклонён до отправки кода.` : `Kamida ${MIN_PASSWORD_LENGTH} belgi. Xavfsiz bo‘lmagan parol kod yuborilishidan oldin ko‘rsatiladi.`}</span>
                </label>

                <label className="flex items-start gap-3 text-sm text-slate-500"><input required name="terms" type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" /><span>{isRu ? "Я согласен с " : ""}<Link href="/terms" target="_blank" className="text-blue-600 underline">{isRu ? "условиями использования" : "Foydalanish shartlari"}</Link>{isRu ? " и " : " va "}<Link href="/privacy" target="_blank" className="text-blue-600 underline">{isRu ? "политикой конфиденциальности" : "maxfiylik qoidalari"}</Link>{isRu ? "." : " bilan tanishdim va roziman."}</span></label>
                <TurnstileChallenge action="signup" onToken={setCaptchaToken} resetNonce={captchaReset} />
                {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                <button type="submit" disabled={isLoading || (captchaRequired && !captchaToken)} className="w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-100">{isLoading ? (isRu ? "Отправка..." : "Yuborilmoqda...") : method === "phone" ? (isRu ? "Получить SMS-код" : "SMS kod olish") : (isRu ? "Получить код по email" : "Email kod olish")}</button>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-slate-500">{isRu ? "Уже есть аккаунт?" : "Hisobingiz bormi?"} <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700">{isRu ? "Войти" : "Kirish"}</Link></p>
          </div>
        </section>
      </div>
    </main>
  );
}
