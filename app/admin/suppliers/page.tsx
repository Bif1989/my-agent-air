"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getCurrentProfile } from "@/app/profile/profile-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import {
  importSuppliers,
  loadSupplierFilterOptions,
  loadSupplierStats,
  loadSuppliers,
  type SupplierFilterOptions,
  type SupplierImportItem,
  type SupplierImportResult,
  type SupplierListQuery,
  type SupplierRow,
  type SupplierStats,
} from "./supplier-api";

const REQUIRED_COLUMNS = ["name"];
const PAGE_SIZE = 50;
const EMPTY_FILTERS = {
  supplierType: "",
  region: "",
  locality: "",
  search: "",
  minPrice: "",
  maxPrice: "",
  sort: "location" as SupplierListQuery["sort"],
};

const EXAMPLE = `name,region,city,address,phone,email,website,registry_number,star_rating,capacity,price_from,price_to,currency,price_unit,source_record_id
Hotel Example,Samarqand viloyati,Samarqand shahri,Registon ko'chasi,+998901234567,info@example.uz,https://example.uz,REG-001,4,120,350000,550000,UZS,1 kecha,REG-001`;

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
      price_from: row.price_from,
      price_to: row.price_to,
      currency: row.currency,
      price_unit: row.price_unit,
      source_record_id: row.source_record_id || row.registry_number || `${supplierType}-${index + 1}-${row.name}`,
      source_type: "official_registry",
      source_name: sourceName || "Rasmiy/open dataset",
      source_url: sourceUrl,
      metadata: { imported_from: "admin_csv" },
    } satisfies SupplierImportItem;
  }).filter((row) => row.name.trim());
}

function supplierTypeLabel(type: string) {
  if (type === "hotel") return "Mehmonxona";
  if (type === "guide") return "Gid";
  if (type === "transport") return "Transport";
  if (type === "restaurant") return "Restoran";
  return type;
}

function formatPrice(row: SupplierRow) {
  const from = row.price_from === null ? null : Number(row.price_from);
  const to = row.price_to === null ? null : Number(row.price_to);
  if (from === null && to === null) return "Narx kiritilmagan";
  const format = (value: number) => new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 2 }).format(value);
  const currency = row.currency || "";
  const unit = row.price_unit ? ` / ${row.price_unit}` : "";
  if (from !== null && to !== null) return `${format(from)}–${format(to)} ${currency}${unit}`.trim();
  if (from !== null) return `${format(from)} ${currency} dan${unit}`.trim();
  return `${format(to as number)} ${currency} gacha${unit}`.trim();
}

export default function AdminSuppliersPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [stats, setStats] = useState<SupplierStats | null>(null);
  const [filterOptions, setFilterOptions] = useState<SupplierFilterOptions>({ regions: [], localities: [] });
  const [supplierRows, setSupplierRows] = useState<SupplierRow[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [listLoading, setListLoading] = useState(false);
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
    let cancelled = false;

    getCurrentProfile().then(async (profile) => {
      if (profile?.role !== "admin" || profile.registration_status !== "active") {
        window.location.replace("/dashboard");
        return null;
      }
      const [statsData, optionsData, rowsData] = await Promise.all([
        loadSupplierStats(),
        loadSupplierFilterOptions(),
        loadSuppliers({ limit: PAGE_SIZE, offset: 0, sort: "location" }),
      ]);
      return { statsData, optionsData, rowsData };
    }).then((data) => {
      if (!data || cancelled) return;
      setStats(data.statsData);
      setFilterOptions(data.optionsData);
      setSupplierRows(data.rowsData);
    }).catch(() => {
      if (!cancelled) setError("Supplier bazasi yuklanmadi.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; window.clearTimeout(sessionTimer); };
  }, []);

  const previewCount = useMemo(() => {
    try { return csv.trim() ? parseCsv(csv, supplierType, sourceName, sourceUrl).length : 0; }
    catch { return 0; }
  }, [csv, supplierType, sourceName, sourceUrl]);

  const localityOptions = useMemo(
    () => filterOptions.localities.filter((item) => !filters.region || item.region === filters.region),
    [filterOptions.localities, filters.region],
  );

  const totalCount = supplierRows.length ? Number(supplierRows[0].total_count) : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  async function fetchRows(nextPage: number, nextFilters = filters) {
    setListLoading(true);
    setError("");
    try {
      const rows = await loadSuppliers({
        supplierType: nextFilters.supplierType,
        region: nextFilters.region,
        locality: nextFilters.locality,
        search: nextFilters.search,
        minPrice: nextFilters.minPrice,
        maxPrice: nextFilters.maxPrice,
        sort: nextFilters.sort,
        limit: PAGE_SIZE,
        offset: nextPage * PAGE_SIZE,
      });
      setSupplierRows(rows);
      setPage(nextPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Supplierlar ro‘yxati yuklanmadi.");
    } finally {
      setListLoading(false);
    }
  }

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
      await fetchRows(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Importda xatolik yuz berdi.");
    } finally { setImporting(false); }
  }

  const statItems = stats ? [
    ["Jami", stats.total], ["Mehmonxona", stats.hotels], ["Gid", stats.guides], ["Transport", stats.transport], ["Restoran", stats.restaurants], ["Telefon bor", stats.with_phone], ["Kontakt tasdiqlangan", stats.verified_contacts],
  ] as const : [];

  return <AppShell session={session} activePath="/admin">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Supplier bazasi</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Supplierlarni filtrlash va boshqarish</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">Viloyat, shahar/tuman, supplier turi va mavjud bo‘lsa narx bo‘yicha tez saralang.</p>
        </header>
        <Link href="/admin" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Admin panel</Link>
      </div>

      {loading && <div className="mt-10 text-sm text-slate-500">Yuklanmoqda...</div>}
      {!loading && <>
        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {statItems.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-[#0b1f3a]">{value}</p></div>)}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#0b1f3a]">Supplierlar ro‘yxati</h2>
              <p className="mt-1 text-sm text-slate-500">Standart lokatsiyalar bo‘yicha saralangan. Hozirgi reestrda narx yo‘q; narx maydonlari keyingi importlar uchun tayyor.</p>
            </div>
            <div className="text-sm font-semibold text-slate-600">Topildi: {totalCount}</div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-semibold text-slate-600">Supplier turi
              <select value={filters.supplierType} onChange={(e) => setFilters((current) => ({ ...current, supplierType: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">
                <option value="">Barchasi</option>
                <option value="hotel">Mehmonxona</option>
                <option value="guide">Gid</option>
                <option value="transport">Transport</option>
                <option value="restaurant">Restoran</option>
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-600">Viloyat
              <select value={filters.region} onChange={(e) => setFilters((current) => ({ ...current, region: e.target.value, locality: "" }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">
                <option value="">Barcha hududlar</option>
                {filterOptions.regions.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-600">Shahar / tuman
              <select value={filters.locality} onChange={(e) => setFilters((current) => ({ ...current, locality: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">
                <option value="">Barchasi</option>
                {localityOptions.map((item) => <option key={`${item.region}-${item.locality}`} value={item.locality}>{item.locality}</option>)}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-600">Saralash
              <select value={filters.sort} onChange={(e) => setFilters((current) => ({ ...current, sort: e.target.value as SupplierListQuery["sort"] }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">
                <option value="location">Lokatsiya bo‘yicha</option>
                <option value="name">Nomi bo‘yicha</option>
                <option value="stars_desc">Yulduzi ko‘pdan</option>
                <option value="price_asc">Narx: arzondan</option>
                <option value="price_desc">Narx: qimmatdan</option>
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-600 xl:col-span-2">Qidiruv
              <input value={filters.search} onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))} placeholder="Nomi, manzil, telefon yoki reestr raqami" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" />
            </label>

            <label className="text-xs font-semibold text-slate-600">Narxdan
              <input type="number" min="0" value={filters.minPrice} onChange={(e) => setFilters((current) => ({ ...current, minPrice: e.target.value }))} placeholder="0" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" />
            </label>

            <label className="text-xs font-semibold text-slate-600">Narxgacha
              <input type="number" min="0" value={filters.maxPrice} onChange={(e) => setFilters((current) => ({ ...current, maxPrice: e.target.value }))} placeholder="Masalan 500000" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => fetchRows(0)} disabled={listLoading} className="rounded-xl bg-[#0b1f3a] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{listLoading ? "Yuklanmoqda..." : "Filtrlash"}</button>
            <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); void fetchRows(0, EMPTY_FILTERS); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Tozalash</button>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Lokatsiya</th>
                  <th className="px-4 py-3">Aloqa</th>
                  <th className="px-4 py-3">Sig‘im / yulduz</th>
                  <th className="px-4 py-3">Narx</th>
                  <th className="px-4 py-3">Manba</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {!supplierRows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Bu filtr bo‘yicha supplier topilmadi.</td></tr>}
                {supplierRows.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#0b1f3a]">{row.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{supplierTypeLabel(row.supplier_type)}{row.registry_number ? ` · ${row.registry_number}` : ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-700">{row.region || "—"}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.city || row.district || "Lokatsiya ko‘rsatilmagan"}</div>
                    {row.address && <div className="mt-1 max-w-xs text-xs text-slate-400">{row.address}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-xs text-slate-700">{row.phone || "—"}</div>
                    {row.email && <div className="mt-1 text-xs text-slate-500">{row.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>{row.capacity ? `${row.capacity} o‘rin` : "Sig‘im —"}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.star_rating ? `${row.star_rating}★` : "Yulduz —"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={row.price_from !== null || row.price_to !== null ? "font-semibold text-emerald-700" : "text-xs text-slate-400"}>{formatPrice(row)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{row.source_name || "—"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">Sahifa {page + 1} / {totalPages}</div>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 0 || listLoading} onClick={() => fetchRows(page - 1)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40">← Oldingi</button>
              <button type="button" disabled={page + 1 >= totalPages || listLoading} onClick={() => fetchRows(page + 1)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40">Keyingi →</button>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold text-[#0b1f3a]">Yangi supplierlarni import qilish</h2>
          <p className="mt-1 text-sm text-slate-500">CSVda narx bo‘lsa price_from, price_to, currency va price_unit ustunlarini ham qo‘shish mumkin.</p>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0b1f3a]">Supplier turi
              <select value={supplierType} onChange={(e) => setSupplierType(e.target.value as SupplierImportItem["supplier_type"])} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-normal"><option value="hotel">Mehmonxona</option><option value="guide">Gid</option><option value="transport">Transport</option><option value="restaurant">Restoran</option></select>
            </label>
            <label className="text-sm font-semibold text-[#0b1f3a]">Manba nomi<input value={sourceName} onChange={(e) => setSourceName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal" /></label>
          </div>
          <label className="mt-5 block text-sm font-semibold text-[#0b1f3a]">Manba URL<input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal" /></label>

          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-[#0b1f3a]">CSV yuklash</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Majburiy ustun: <b>name</b>. Tavsiya: region, city, district, address, phone, email, website, registry_number, star_rating, capacity, price_from, price_to, currency, price_unit, source_record_id.</p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => handleFile(e.target.files?.[0])} className="mt-4 block w-full text-sm text-slate-600" />
          </div>

          <label className="mt-6 block text-sm font-semibold text-[#0b1f3a]">CSV ko‘rinishi / qo‘lda joylash<textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={12} placeholder={EXAMPLE} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-mono text-xs font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>

          {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {result && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Import yakunlandi: <b>{result.inserted}</b> yangi, <b>{result.updated}</b> yangilandi, <b>{result.skipped}</b> o‘tkazib yuborildi.</div>}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleImport} disabled={importing || !csv.trim()} className="rounded-xl bg-[#0b1f3a] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{importing ? "Import qilinmoqda..." : `Import qilish${previewCount ? ` (${previewCount})` : ""}`}</button>
            <button type="button" onClick={() => setCsv(EXAMPLE)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Namuna CSV</button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><b>Muhim:</b> faqat rasmiy/open dataset yoki foydalanishga ruxsat berilgan biznes kontaktlarini import qiling. Telefon va email oddiy foydalanuvchilarga ochiq katalog sifatida berilmaydi; ular supplier matching va nazoratli taklif yuborish uchun ishlatiladi.</section>
      </>}
    </div>
  </AppShell>;
}
