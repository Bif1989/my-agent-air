"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import AuthCard, { authButtonClass, authInputClass } from "@/app/components/auth-card";
import { clearSession, consumeRecoveryLink } from "@/lib/supabase-auth";
import { updateRecoveryPassword } from "@/lib/recovery-password";

const MIN_PASSWORD_LENGTH = 10;

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const recovery = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    let active = true;
    if (!recovery.current) {
      recovery.current = consumeRecoveryLink(window.location.href);
      // Remove credentials from the address bar and browser history immediately.
      window.history.replaceState(null, "", window.location.pathname);
    }
    void recovery.current.then(() => { if (active) setReady(true); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Havola ishlamadi. Yangi havola so‘rang.");
    });
    return () => { active = false; };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Parol kamida ${MIN_PASSWORD_LENGTH} belgidan iborat bo‘lsin.`);
    if (password !== String(form.get("confirmation") || "")) return setError("Parollar bir xil bo‘lishi kerak.");
    setLoading(true); setError("");
    try { await updateRecoveryPassword(password); clearSession(); setDone(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Parolni yangilab bo‘lmadi."); }
    finally { setLoading(false); }
  }
  return <AuthCard title="Yangi parol" description={`Kamida ${MIN_PASSWORD_LENGTH} belgidan iborat, boshqa saytlarda ishlatilmagan yangi parol tanlang.`}>{done ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">Parol yangilandi. Endi yangi parolingiz bilan kiring.</p> : <>
    {!ready && !error && <p className="text-sm text-slate-500">Tiklash havolasi tekshirilmoqda...</p>}
    {ready && <form onSubmit={submit} className="space-y-5"><label className="block text-sm font-semibold text-slate-700">Yangi parol<input name="password" type="password" minLength={MIN_PASSWORD_LENGTH} required autoComplete="new-password" className={authInputClass} /></label><label className="block text-sm font-semibold text-slate-700">Parolni takrorlang<input name="confirmation" type="password" minLength={MIN_PASSWORD_LENGTH} required autoComplete="new-password" className={authInputClass} /></label><button type="submit" disabled={loading} className={authButtonClass}>{loading ? "Saqlanmoqda..." : "Parolni yangilash"}</button></form>}
    {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}<Link href="/forgot-password" className="mt-2 block font-semibold underline">Yangi tiklash havolasini so‘rash</Link></div>}
  </>}</AuthCard>;
}
