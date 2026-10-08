"use client";

import { useState, type FormEvent } from "react";
import AuthCard, { authButtonClass, authInputClass } from "@/app/components/auth-card";
import TurnstileChallenge, { TURNSTILE_SITE_KEY } from "@/app/components/turnstile-challenge";
import { requestPasswordResetProtected } from "@/lib/public-auth";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const captchaRequired = Boolean(TURNSTILE_SITE_KEY);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (captchaRequired && !captchaToken) return setError("Xavfsizlik tekshiruvini yakunlang.");
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    setLoading(true); setError("");
    try {
      await requestPasswordResetProtected(email, captchaToken);
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Havolani yuborib bo‘lmadi. Qayta urinib ko‘ring.");
      if (captchaRequired) setCaptchaReset((value) => value + 1);
    } finally { setLoading(false); }
  }
  return <AuthCard title="Parolni tiklash" description="Ro‘yxatdan o‘tgan emailingizni kiriting. Yangi parol o‘rnatish uchun havola yuboramiz.">{sent ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-700">Bu emailga tegishli hisob mavjud bo‘lsa, tiklash havolasi yuborildi. Pochtangiz va spam papkasini tekshiring.</p> : <form onSubmit={submit} className="space-y-5"><label className="block text-sm font-semibold text-slate-700">Email<input name="email" type="email" required autoComplete="email" className={authInputClass} /></label><TurnstileChallenge action="recover" onToken={setCaptchaToken} resetNonce={captchaReset} />{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button type="submit" disabled={loading || (captchaRequired && !captchaToken)} className={authButtonClass}>{loading ? "Yuborilmoqda..." : "Tiklash havolasini yuborish"}</button></form>}</AuthCard>;
}
