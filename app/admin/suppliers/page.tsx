"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getCurrentProfile } from "@/app/profile/profile-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { importSuppliers, loadSupplierStats, type SupplierImportItem, type SupplierImportResult, type SupplierStats } from "./supplier-api";

const REQUIRED_COLUMNS = ["name"];
const EXAMPLE = `name,region,city,address,phone,email,website,registry_number,star_rating,capacity,source_record_id\nHotel Example,Samarqand,Samarqand,Registon ko'chasi,+998901234567,info@example.uz,https://example.uz,REG-001,4,120,REG-001`;

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim()); current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string, supplierType: SupplierImportItem["supplier_type"], sourceName: string, sourceUrl: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV faylda sarlavha va kamida bitta qator bo‘lishi kerak.");
  const headers = splitCsvLine(lines[0]).map((value) => value.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Majburiy ustun yetishmayapti: ${missing.join(", ")}`);

  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || ""]));
    return {
      supplier_type: supplierType,
      name: row.name,
      region: row.region,
      city: row.city,
      district: row.district,
      address: row.address,
      phone: row.phone,
      email: row.email,
      website: row.website,
      telegram: row.telegram,
      registry_number: row.registry_number,
      star_rating: row.star_rating,
      capacity: row.capacity,
      source_record_id: row.source_record_id || row.registry_number || `${supplierType}-${index + 1}-${row.name}`,
      source_type: "official_registry",
      source_name: sourceName || "Rasmiy/open dataset",
      source_url: sourceUrl,
      metadata: { imported_from: "admin_csv" },
    } satisfies SupplierImportItem;
  }).filter((row) => row.name.trim());
}

export default function AdminSuppliersPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [stats, setStats] = useState<SupplierStats | null>(null);
  const [csv, setCsv] = useState("");
  const [supplierType, setSupplierType] = useState<SupplierImportItem["supplier_type"]>("hotel");
  const [sourceName, setSourceName] = useState("O‘zbekiston turizm reyestri");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SupplierImportResult | null>(null);

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) { window.location.replace("/login"); return; }
    const sessionTimer = window.setTimeout(() => setSession(stored), 0);
    getCurrentProfile().then((profile) => {
      if (profile?.role !== "admin" || profile.registration_status !== "active") { window.location.replace("/dashboard"); return null; }
      return loadSupplierStats();
    }).then((data) => { if (data) setStats(data); }).catch(() => setError("Supplier statistikasi yuklanmadi.")).finally(() => setLoading(false));
    return () => window.clearTimeout(sessionTimer);
  }, []);

  const previewCount = useMemo(() => {
    try { return csv.trim() ? parseCsv(csv, supplierType, sourceName, sourceUrl).length : 0; }
    catch { return 0; }
  }, [csv, supplierType, sourceName, sourceUrl]);

  async function handleFile(file?: File) {
    if (!file) return;
    setCsv(await file.text());
    setResult(null);
    setError("");
  }

  async function handleImport() {
    setError(""); setResult(null);
    try {
      const rows = parseCsv(csv, supplierType, sourceName, sourceUrl);
      if (!rows.length) throw new Error("Import uchun ma’lumot topilmadi.");
      setImporting(true);
      let inserted = 0, updated = 0, skipped = 0, total = 0;
      for (let i = 0; i < rows.length; i += 300) {
        const part = await importSuppliers(rows.slice(i, i + 300));
        inserted += part.inserted; updated += part.updated; skipped += part.skipped; total += part.total;
      }
      const summary = { inserted, updated, skipped, total };
      setResult(summary);
      setStats(await loadSupplierStats());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Importda xatolik yuz berdi.");
    } finally { setImporting(false); }
  }

  const statItems = stats ? [
    ["Jami", stats.total], ["Mehmonxona", stats.hotels], ["Gid", stats.guides], ["Transport", stats.transport], ["Restoran", stats.restaurants], ["Telefon bor", stats.with_phone], ["Kontakt tasdiqlangan", stats.verified_contacts],
  ] as const : [];

  return <AppShell session={session} activePath="/admin">
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Supplier bazasi</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Tashqi hamkorlarni import qilish</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Rasmiy/open datasetdagi mehmonxona, gid, transport va restoranlarni Agent Bifavia bazasiga dublikatlarsiz qo‘shing.</p></header>
        <Link href="/admin" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Admin panel</Link>
      </div>

      {loading && <div className="mt-10 text-sm text-slate-500">Yuklanmoqda...</div>}
      {!loading && <>
        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{statItems.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-[#0b1f3a]">{value}</p></div>)}</section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0b1f3a]">Supplier turi<select value={supplierType} onChange={(e) => setSupplierType(e.target.value as SupplierImportItem["supplier_type"])} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-normal"><option value="hotel">Mehmonxona</option><option value="guide">Gid</option><option value="transport">Transport</option><option value="restaurant">Restoran</option></select></label>
            <label className="text-sm font-semibold text-[#0b1f3a]">Manba nomi<input value={sourceName} onChange={(e) => setSourceName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal" /></label>
          </div>
          <label className="mt-5 block text-sm font-semibold text-[#0b1f3a]">Manba URL<input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal" /></label>

          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-[#0b1f3a]">CSV yuklash</p><p className="mt-1 text-xs leading-5 text-slate-500">Majburiy ustun: <b>name</b>. Tavsiya: region, city, address, phone, email, website, registry_number, star_rating, capacity, source_record_id.</p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => handleFile(e.target.files?.[0])} className="mt-4 block w-full text-sm text-slate-600" />
          </div>

          <label className="mt-6 block text-sm font-semibold text-[#0b1f3a]">CSV ko‘rinishi / qo‘lda joylash<textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={12} placeholder={EXAMPLE} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-mono text-xs font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>

          {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {result && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Import yakunlandi: <b>{result.inserted}</b> yangi, <b>{result.updated}</b> yangilandi, <b>{result.skipped}</b> o‘tkazib yuborildi.</div>}

          <div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={handleImport} disabled={importing || !csv.trim()} className="rounded-xl bg-[#0b1f3a] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{importing ? "Import qilinmoqda..." : `Import qilish${previewCount ? ` (${previewCount})` : ""}`}</button><button type="button" onClick={() => setCsv(EXAMPLE)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Namuna CSV</button></div>
        </section>

        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><b>Muhim:</b> faqat rasmiy/open dataset yoki foydalanishga ruxsat berilgan biznes kontaktlarini import qiling. Telefon va email oddiy foydalanuvchilarga ochiq katalog sifatida berilmaydi; ular supplier matching va nazoratli taklif yuborish uchun ishlatiladi.</section>
      </>}
    </div>
  </AppShell>;
}