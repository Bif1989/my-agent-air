"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { getCurrentProfile, listUzLocations, updateCurrentProfile, type EditableProfile, type ProfileRecord, type UzLocation } from "@/app/profile/profile-api";
import NotificationSettings from "@/app/profile/notification-settings";
import SupplierCapabilities from "@/app/profile/supplier-capabilities";
import { AGENT_TYPES as agentTypes, missingProfileFields } from "@/lib/profile-completion";

function initials(profile: ProfileRecord | EditableProfile) {
  return (profile.full_name || profile.company_name || "Agent")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function validate(profile: EditableProfile) {
  if (missingProfileFields(profile).length) return "Ism, kompaniya, viloyat/hudud, tuman/shahar, telefon va agent turini to‘ldiring.";
  if (!/^[+\d\s()-]{7,40}$/.test(profile.phone.trim()) || profile.phone.replace(/\D/g, "").length < 7) return "Telefon raqamini to‘g‘ri kiriting.";
  if (profile.full_name.length > 120) return "To‘liq ism 120 belgidan oshmasin.";
  if (profile.company_name.length > 160) return "Kompaniya nomi 160 belgidan oshmasin.";
  if (profile.region.length > 120) return "Viloyat/hudud nomi 120 belgidan oshmasin.";
  if (profile.city.length > 120) return "Tuman/shahar nomi 120 belgidan oshmasin.";
  if (profile.phone.length > 40) return "Telefon 40 belgidan oshmasin.";
  if (profile.avatar_url && !/^https?:\/\/[^\s]+$/i.test(profile.avatar_url)) return "Avatar URL http yoki https bilan boshlanishi kerak.";
  if (profile.services.length > 20) return "Ko‘pi bilan 20 ta xizmat qo‘shish mumkin.";
  if (profile.services.some((service) => service.length > 80)) return "Har bir xizmat 80 belgidan oshmasin.";
  return "";
}

function Field({ label, value, onChange, maxLength, type = "text" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  type?: string;
}) {
  return <label className="block text-sm font-semibold text-[#0b1f3a]">
    {label}
    <input type={type} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
  </label>;
}

function ProfilePreview({ profile, services, verified }: {
  profile: EditableProfile & { id: string };
  services: string[];
  verified: boolean | null;
}) {
  return <aside className="rounded-2xl border border-slate-200 bg-[#0b1f3a] p-6 text-white shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Ko‘rinish</p>
    <div className="mt-6 flex items-center gap-4">
      {profile.avatar_url
        ? <Image src={profile.avatar_url} alt="Profil avatari" width={64} height={64} unoptimized className="h-16 w-16 rounded-2xl object-cover" />
        : <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-300 text-xl font-bold text-[#0b1f3a]">{initials(profile)}</span>}
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold">{profile.full_name || "Ism ko‘rsatilmagan"}</h2>
        <p className="truncate text-sm text-blue-200">{profile.company_name || "Kompaniya ko‘rsatilmagan"}</p>
      </div>
    </div>
    <dl className="mt-7 space-y-3 border-t border-white/10 pt-5 text-sm">
      <div className="flex justify-between gap-4"><dt className="text-blue-200">Viloyat / hudud</dt><dd className="text-right font-medium">{profile.region || "Ko‘rsatilmagan"}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-blue-200">Tuman / shahar</dt><dd className="text-right font-medium">{profile.city || "Ko‘rsatilmagan"}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-blue-200">Agent turi</dt><dd className="text-right font-medium">{profile.agent_type || "Ko‘rsatilmagan"}</dd></div>
    </dl>
    <div className="mt-5 flex flex-wrap gap-2">
      {services.length
        ? services.map((service) => <span key={service} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-blue-100">{service}</span>)
        : <span className="text-sm text-blue-200">Xizmatlar ko‘rsatilmagan</span>}
    </div>
    <p className="mt-6 rounded-xl bg-white/10 px-3 py-2 text-sm text-cyan-100">{verified ? "Tasdiqlangan agent" : "Tasdiqlanmagan"}</p>
    <Link href={`/agents/${profile.id}`} className="mt-5 block text-center text-sm font-semibold text-cyan-300 hover:text-white">Agentlar katalogida ko‘rish →</Link>
  </aside>;
}

export default function ProfilePage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [locations, setLocations] = useState<UzLocation[]>([]);
  const [form, setForm] = useState<EditableProfile>({ full_name: "", avatar_url: "", company_name: "", region: "", city: "", phone: "", agent_type: "", services: [] });
  const [serviceInput, setServiceInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      setError("");
      setSession(stored);
      Promise.all([getCurrentProfile(), listUzLocations()])
        .then(([loaded, loadedLocations]) => {
          if (!loaded) throw new Error("PROFILE_NOT_FOUND");
          setProfile(loaded);
          setLocations(loadedLocations);
          setForm({
            full_name: loaded.full_name || "",
            avatar_url: loaded.avatar_url || "",
            company_name: loaded.company_name || "",
            region: loaded.region || "",
            city: loaded.city || "",
            phone: loaded.phone || "",
            agent_type: loaded.agent_type || "",
            services: loaded.services || [],
          });
        })
        .catch((loadError: unknown) => {
          if (loadError instanceof Error && loadError.message.includes("AUTH_SESSION")) window.location.replace("/login");
          else setError("Profil yoki lokatsiyalar ro‘yxatini yuklashda xatolik yuz berdi.");
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadAttempt]);

  const regions = useMemo(() => [...new Set(locations.map((location) => location.region))], [locations]);
  const localityOptions = useMemo(() => locations.filter((location) => location.region === form.region), [locations, form.region]);

  const setField = (field: keyof Omit<EditableProfile, "services">, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setMessage("");
  };

  const setRegion = (value: string) => {
    setForm((current) => ({ ...current, region: value, city: "" }));
    setDirty(true);
    setMessage("");
  };

  function addService() {
    const value = serviceInput.trim();
    if (!value || form.services.includes(value) || form.services.length >= 20) return;
    setForm((current) => ({ ...current, services: [...current.services, value] }));
    setServiceInput("");
    setDirty(true);
  }

  function removeService(service: string) {
    setForm((current) => ({ ...current, services: current.services.filter((item) => item !== service) }));
    setDirty(true);
  }

  async function save() {
    const validation = validate(form);
    if (validation) { setError(validation); return; }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await updateCurrentProfile({
        ...form,
        full_name: form.full_name.trim(),
        avatar_url: form.avatar_url.trim(),
        company_name: form.company_name.trim(),
        region: form.region.trim(),
        city: form.city.trim(),
        phone: form.phone.trim(),
        agent_type: form.agent_type.trim(),
      });
      if (updated) setProfile(updated);
      setDirty(false);
      setMessage("Profil muvaffaqiyatli saqlandi.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error && saveError.message.includes("AUTH_SESSION") ? "Sessiya tugagan. Qayta kiring." : "Profilni saqlashda xatolik yuz berdi.");
    } finally {
      setSaving(false);
    }
  }

  const preview = useMemo(() => ({ ...form, id: profile?.id || "" }), [form, profile?.id]);

  return <AppShell session={session} activePath="/profile">
    <div className="mx-auto max-w-6xl">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Hisob sozlamalari</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Hisob va tarif</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Profil ma’lumotlari, xizmatlaringiz, tarif/to‘lov va referal bonuslarini bir joydan boshqaring.</p>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">Profil</p>
          <p className="mt-1 text-sm font-semibold text-[#0b1f3a]">Profil ma’lumotlari</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Ism, kompaniya, telefon va xizmatlarni boshqarish.</p>
        </div>
        <Link href="/billing" className="rounded-2xl border border-blue-300 bg-blue-600 p-4 text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-700 hover:shadow-md">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-100">Hisob va tarif</p>
          <p className="mt-1 text-sm font-semibold text-white">Balans va to‘lovlar →</p>
          <p className="mt-1 text-xs leading-5 text-blue-100">Balans, bepul limit, bitim narxi va hisob tarixini ko‘rish.</p>
        </Link>
        <Link href="/billing/subscription" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 transition hover:border-emerald-300 hover:shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">Unlimited</p>
          <p className="mt-1 text-sm font-semibold text-[#0b1f3a]">Oylik Unlimited →</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Balansdan yoki Click orqali abonent tarifiga o‘tish.</p>
        </Link>
        <Link href="/referral" className="rounded-2xl border border-violet-200 bg-violet-50 p-4 transition hover:border-violet-300 hover:shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600">Referal</p>
          <p className="mt-1 text-sm font-semibold text-[#0b1f3a]">3 bosqichli bonus →</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">15 000 + 10 000 + 5 000 UZS. Faqat tasdiqlangan real bizneslar uchun.</p>
        </Link>
      </div>

      {!loading && profile && <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        {missingProfileFields(profile).length
          ? "So‘rov yoki taklif berishdan oldin profilni to‘ldiring: " + missingProfileFields(profile).join(", ") + "."
          : <Link href="/dashboard" className="font-semibold">Profil tayyor. Ish paneliga qaytish →</Link>}
      </div>}

      {loading && <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">Profil yuklanmoqda...</div>}
      {!loading && !profile && error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
        <p role="alert" className="text-sm text-red-700">{error}</p>
        <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="mt-3 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">Qayta urinish</button>
      </div>}

      {!loading && profile && <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="To‘liq ism *" value={form.full_name} onChange={(value) => setField("full_name", value)} maxLength={120} />
            <Field label="Kompaniya *" value={form.company_name} onChange={(value) => setField("company_name", value)} maxLength={160} />
            <label className="block text-sm font-semibold text-[#0b1f3a]">Viloyat / hudud *
              <select value={form.region} onChange={(event) => setRegion(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                <option value="">Tanlang</option>
                {regions.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-[#0b1f3a]">Tuman / shahar *
              <select value={form.city} disabled={!form.region} onChange={(event) => setField("city", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400">
                <option value="">{form.region ? "Tanlang" : "Avval viloyat/hududni tanlang"}</option>
                {localityOptions.map((location) => <option key={`${location.region}:${location.locality}`} value={location.locality}>{location.locality}</option>)}
              </select>
            </label>
            <Field label="Telefon *" value={form.phone} onChange={(value) => setField("phone", value)} maxLength={40} type="tel" />
            <Field label="Avatar URL" value={form.avatar_url} onChange={(value) => setField("avatar_url", value)} maxLength={500} type="url" />
            <label className="block text-sm font-semibold text-[#0b1f3a]">Agent turi *
              <select value={form.agent_type} onChange={(event) => setField("agent_type", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                <option value="">Tanlang</option>
                {!agentTypes.includes(form.agent_type) && form.agent_type && <option value={form.agent_type}>{form.agent_type}</option>}
                {agentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
          </div>

          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">Lokatsiya erkin yozilmaydi. Viloyat/hudud va tuman/shahar faqat standart ro‘yxatdan tanlanadi.</p>

          <div className="mt-5">
            <label className="block text-sm font-semibold text-[#0b1f3a]">Xizmatlar</label>
            <div className="mt-2 flex gap-2">
              <input aria-label="Xizmat nomi" value={serviceInput} maxLength={80} onChange={(event) => setServiceInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addService(); } }} placeholder="Masalan, aviachipta" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
              <button type="button" onClick={addService} className="rounded-xl bg-[#0b1f3a] px-4 py-3 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-100">Qo‘shish</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {form.services.map((service) => <span key={service} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                {service}
                <button type="button" aria-label={`${service} xizmatini olib tashlash`} onClick={() => removeService(service)} className="font-bold text-blue-500 hover:text-red-600">×</button>
              </span>)}
            </div>
          </div>

          <div className="mt-7 border-t border-slate-100 pt-6">
            <h2 className="text-sm font-semibold text-[#0b1f3a]">Hisob ma’lumotlari</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-400">Email</dt><dd className="mt-1 font-medium text-slate-700">{session?.user.email || "Ko‘rsatilmagan"}</dd></div>
              <div><dt className="text-slate-400">Holat</dt><dd className="mt-1 font-medium text-slate-700">{profile.is_verified ? "Tasdiqlangan" : "Tasdiqlanmagan"}</dd></div>
              <div><dt className="text-slate-400">Rol</dt><dd className="mt-1 font-medium text-slate-700">{profile.role === "admin" ? "Administrator" : "Agent"}</dd></div>
              <div><dt className="text-slate-400">Ro‘yxatdan o‘tgan</dt><dd className="mt-1 font-medium text-slate-700">{new Intl.DateTimeFormat("uz-UZ", { dateStyle: "long" }).format(new Date(profile.created_at))}</dd></div>
            </dl>
          </div>

          {(error || message || dirty) && <div className="mt-6 space-y-2" aria-live="polite">
            {dirty && !message && <p className="text-sm text-amber-700">Saqlanmagan o‘zgarishlar bor.</p>}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-emerald-700">{message}</p>}
          </div>}
          <button type="button" onClick={save} disabled={saving || !dirty} className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saqlanmoqda..." : "O‘zgarishlarni saqlash"}</button>
        </section>
        <ProfilePreview profile={preview} services={form.services} verified={profile.is_verified} />
      </div>}

      {!loading && profile && <SupplierCapabilities defaultCity={form.city} />}
      {!loading && <NotificationSettings />}
    </div>
  </AppShell>;
}
