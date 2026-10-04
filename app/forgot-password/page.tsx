"use client";

import { useState, type FormEvent } from "react";
import AuthCard, { authButtonClass, authInputClass } from "@/app/components/auth-card";
import { requestPasswordReset } from "@/lib/supabase-auth";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    setLoading(true); setError("");
    try {
      await requestPasswordReset(email, `${window.location.origin}/reset-password`);
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Havolani yuborib bo‘lmadi. Qayta urinib ko‘ring.");
    } finally { setLoading(false); }
  }
  return <AuthCard title="Parolni tiklash" description="Ro‘yxatdan o‘tgan emailingizni kiriting. Yangi parol o‘rnatish uchun havola yuboramiz.">{sent ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-700">Bu emailga tegishli hisob mavjud bo‘lsa, tiklash havolasi yuborildi. Pochtangiz va spam papkasini tekshiring.</p> : <form onSubmit={submit} className="space-y-5"><label className="block text-sm font-semibold text-slate-700">Email<input name="email" type="email" required autoComplete="email" className={authInputClass} /></label>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button type="submit" disabled={loading} className={authButtonClass}>{loading ? "Yuborilmoqda..." : "Tiklash havolasini yuborish"}</button></form>}</AuthCard>;
}
