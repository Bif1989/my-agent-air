"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { listRequests, type RequestRecord } from "@/app/requests/requests-api";
import { getOffersForRequest, type OfferRecord } from "@/app/offers/offers-api";
import { listSupplierInvites, matchSuppliersForRequest, type SupplierInviteRow, type SupplierMatch } from "@/app/requests/supplier-matching-api";
import { requestIssues, requestTitle } from "@/lib/service-request";
import { buildRfqRows, relatedRequests, serviceLabel, sortRfqRows, sourceText, supplierTypes, type RfqDetail, type RfqRow, type RfqSort } from "@/lib/rfq-monitor";

const PAGE_SIZE = 40;
const cardClass = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
const fieldClass = "min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const allServices = ["Mehmonxona", "Transport", "Gid", "Restoran", "Tur paket", "Aviachipta", "Viza", "Boshqa"];
type RowFilter = "all" | "responded" | "waiting" | "matched" | "saved";

function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", year: "numeric" }).format(parsed) : date;
}

function amount(row: RfqRow): string {
  return row.price === null ? "Narx kiritilmagan" : row.price.toLocaleString("uz-UZ") + " " + (row.currency || "");
}

function statusText(row: RfqRow): string {
  return {
    matched: "Mos hamkor",
    waiting: "Javob kutilmoqda",
    responded: "Taklif kelgan",
    accepted: "Tanlangan taklif",
    unavailable: "Mavjud emas / rad etilgan",
    failed: "Yetkazish muammosi",
  }[row.state];
}

function statusClass(row: RfqRow): string {
  if (row.state === "responded" || row.state === "accepted") return "bg-emerald-50 text-emerald-700";
  if (row.state === "waiting") return "bg-amber-50 text-amber-700";
  if (row.state === "unavailable" || row.state === "failed") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

function Stat({ title, value }: { title: string; value: number }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-4">
    <p className="text-2xl font-bold tabular-nums text-[#0b1f3a]">{value}</p>
    <p className="mt-1 text-[11px] font-medium text-slate-500">{title}</p>
  </div>;
}

function loadSaved(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 500) : [];
  } catch { return []; }
}

export default function RfqControlPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [details, setDetails] = useState<RfqDetail[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);
  const [query, setQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [sort, setSort] = useState<RfqSort>("match");
  const [showSavedRequests, setShowSavedRequests] = useState(false);
  const [savedRequests, setSavedRequests] = useState<string[]>([]);
  const [savedRows, setSavedRows] = useState<string[]>([]);

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) {
      window.location.replace("/login?next=/rfq-control");
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setSession(stored);
      setSavedRequests(loadSaved("maa:rfq:requests:" + stored.user.id));
      setSavedRows(loadSaved("maa:rfq:rows:" + stored.user.id));
      listRequests({ createdBy: stored.user.id, limit: PAGE_SIZE, offset: 0 })
        .then((items) => {
          if (!active) return;
          setRequests(items);
          setHasMore(items.length === PAGE_SIZE);
          setSelectedId(items[0]?.id || "");
        })
        .catch(() => { if (active) setError("So‘rovlarni yuklab bo‘lmadi. Profilingiz va internet aloqasini tekshiring."); })
        .finally(() => { if (active) setLoadingRequests(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  const selected = useMemo(() => requests.find((item) => item.id === selectedId) || null, [requests, selectedId]);
  const members = useMemo(() => selected ? relatedRequests(requests, selected) : [], [requests, selected]);

  useEffect(() => {
    if (!session || !members.length) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingDetails(true);
      setDetailError("");
      setDetails([]);
      Promise.all(members.map(async (request) => {
        let failed = false;
        const offers = await getOffersForRequest(request.id).catch(() => { failed = true; return [] as OfferRecord[]; });
        const types = supplierTypes(request.category);
        const invites = types.length
          ? await listSupplierInvites(request.id).catch(() => { failed = true; return [] as SupplierInviteRow[]; })
          : [];
        const matched = await Promise.all(types.map((type) => matchSuppliersForRequest(request.id, type, 20)
          .catch(() => { failed = true; return [] as SupplierMatch[]; })));
        return { data: { request, offers, invites, matches: matched.flat() } as RfqDetail, failed };
      })).then((loaded) => {
        if (!active) return;
        setDetails(loaded.map((entry) => entry.data));
        if (loaded.some((entry) => entry.failed)) setDetailError("Айрим ҳамкор ёки таклифлар ҳозирча юкланмади. Мавжуд маълумотлар кўрсатилди.");
      }).catch(() => {
        if (active) setDetailError("RFQ маълумотларини юклаб бўлмади.");
      }).finally(() => { if (active) setLoadingDetails(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [session, members, refreshCount]);

  const allRows = useMemo(() => buildRfqRows(details), [details]);
  const filteredRows = useMemo(() => sortRfqRows(allRows.filter((row) => {
    if (serviceFilter !== "all" && row.service !== serviceFilter) return false;
    if (rowFilter === "responded" && !["responded", "accepted"].includes(row.state)) return false;
    if (rowFilter === "waiting" && row.state !== "waiting") return false;
    if (rowFilter === "matched" && row.state !== "matched") return false;
    if (rowFilter === "saved" && !savedRows.includes(row.key)) return false;
    return true;
  }), sort), [allRows, rowFilter, savedRows, serviceFilter, sort]);

  const list = useMemo(() => requests.filter((item) => {
    const q = query.toLocaleLowerCase().trim();
    const text = [requestTitle(item), item.category, item.origin, item.destination, item.description].filter(Boolean).join(" ").toLocaleLowerCase();
    return (!q || text.includes(q)) && (!showSavedRequests || savedRequests.includes(item.id));
  }), [requests, query, showSavedRequests, savedRequests]);

  const serviceBlocks = useMemo(() => {
    const entries = members.flatMap((item) => supplierTypes(item.category).map(serviceLabel).concat([item.category]));
    return [...new Set([...entries, ...allRows.map((row) => row.service)])].filter(Boolean);
  }, [members, allRows]);

  const issueMessages = useMemo(() => {
    const warnings = members.flatMap((item) => requestIssues(item).map((issue) => issue.message));
    return [...new Set(warnings)].slice(0, 8);
  }, [members]);

  function toggleRequest(id: string) {
    if (!session) return;
    const next = savedRequests.includes(id) ? savedRequests.filter((item) => item !== id) : [...savedRequests, id];
    setSavedRequests(next);
    try { window.localStorage.setItem("maa:rfq:requests:" + session.user.id, JSON.stringify(next)); } catch { /* Browser storage unavailable. */ }
  }

  function toggleRow(key: string) {
    if (!session) return;
    const next = savedRows.includes(key) ? savedRows.filter((item) => item !== key) : [...savedRows, key];
    setSavedRows(next);
    try { window.localStorage.setItem("maa:rfq:rows:" + session.user.id, JSON.stringify(next)); } catch { /* Browser storage unavailable. */ }
  }

  async function loadMore() {
    if (!session || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = await listRequests({ createdBy: session.user.id, offset: requests.length, limit: PAGE_SIZE });
      setRequests((old) => [...new Map([...old, ...next].map((item) => [item.id, item])).values()]);
      setHasMore(next.length === PAGE_SIZE);
    } catch { setError("Қўшимча сўровларни юклаб бўлмади."); }
    finally { setLoadingMore(false); }
  }

  const responded = allRows.filter((row) => ["responded", "accepted"].includes(row.state)).length;
  const waiting = allRows.filter((row) => row.state === "waiting").length;
  const savedForSelected = allRows.filter((row) => savedRows.includes(row.key)).length;
  const original = selected ? sourceText(selected) || selected.description || requestTitle(selected) : "";
  const searchName = selected ? requestTitle(selected) : "";

  return <AppShell session={session} activePath="/rfq-control">
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600">My Agent Air · RFQ</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0b1f3a] sm:text-3xl">So‘rovlarni nazorat qilish</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Mehmonxona, transport, gid va boshqa xizmatlar: hamkorlar, javoblar va variantlar bir joyda.</p>
        </div>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-800">Faqat kuzatish · Read-only</span>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-4 xl:grid-cols-[310px_minmax(0,1fr)]">
        <aside className={cardClass + " self-start"}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">Saqlangan so‘rovlar</h2>
            <span className="text-xs text-slate-400">{requests.length} ta yuklandi</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Barcha shaxsiy RFQ tarixidan tanlang.</p>
          <label htmlFor="rfq-query" className="mt-4 block text-xs font-semibold text-slate-500">Qidirish</label>
          <input id="rfq-query" value={query} onChange={(event) => setQuery(event.target.value)} className={fieldClass + " mt-1"} placeholder="Yo‘nalish, xizmat, matn..." />
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showSavedRequests} onChange={(event) => setShowSavedRequests(event.target.checked)} />
            Faqat yulduzlangan so‘rovlar
          </label>
          <div className="mt-3 max-h-[650px] space-y-2 overflow-y-auto pr-1">
            {loadingRequests && <p role="status" className="p-4 text-sm text-slate-500">So‘rovlar yuklanmoqda...</p>}
            {!loadingRequests && !list.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Bu filtr bo‘yicha so‘rov topilmadi.</p>}
            {list.map((item) => (
              <div key={item.id} className={item.id === selectedId ? "flex items-start gap-1 rounded-xl border border-blue-400 bg-blue-50 p-2" : "flex items-start gap-1 rounded-xl border border-slate-100 p-2 hover:bg-slate-50"}>
                <button type="button" onClick={() => { setSelectedId(item.id); setServiceFilter("all"); setRowFilter("all"); }} aria-current={item.id === selectedId ? "true" : undefined} className="min-w-0 flex-1 px-1 text-left">
                  <p className="truncate text-sm font-semibold text-[#0b1f3a]">{requestTitle(item)}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.category} · {formatDate(item.created_at)}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{item.status}</p>
                </button>
                <button type="button" onClick={() => toggleRequest(item.id)} aria-label={savedRequests.includes(item.id) ? "Saqlanganlardan olish" : "So‘rovni saqlash"} className="rounded-lg px-2 py-1 text-lg text-amber-600" title="So‘rovni yulduzlash">{savedRequests.includes(item.id) ? "★" : "☆"}</button>
              </div>
            ))}
          </div>
          {hasMore && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60">{loadingMore ? "Yuklanmoqda..." : "Yana 40 ta yuklash"}</button>}
        </aside>

        <section className="min-w-0 space-y-4">
          {!selected && !loadingRequests && <div className={cardClass}><p className="text-sm text-slate-500">Nazorat qilish uchun chapdan so‘rov tanlang. Yangi so‘rovlar <Link href="/requests" className="font-semibold text-blue-600 underline">So‘rovlar</Link> bo‘limida ko‘rinadi.</p></div>}
          {selected && <>
            <div className={cardClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tanlangan RFQ · {formatDate(selected.created_at)}</p>
                  <h2 className="mt-1 break-words text-xl font-bold">{searchName}</h2>
                  <p className="mt-1 text-sm text-slate-500">{members.length} ta bog‘langan xizmat so‘rovi · {selected.status}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setRefreshCount((value) => value + 1)} disabled={loadingDetails} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Yangilash</button>
                  <Link href={"/requests/" + selected.id} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">Asl so‘rovni ochish</Link>
                </div>
              </div>
              {members.length > 1 && <p className="mt-3 rounded-lg bg-cyan-50 px-3 py-2 text-xs text-cyan-800">Bir xil asl matndan 30 daqiqa ichida yaratilgan xizmatlar bir guruhda ko‘rsatildi.</p>}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat title="Mos hamkor va taklif" value={allRows.length} />
                <Stat title="Kelgan javoblar" value={responded} />
                <Stat title="Javob kutilmoqda" value={waiting} />
                <Stat title="Saqlangan variant" value={savedForSelected} />
              </div>
            </div>

            <div className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">Xizmat bloklari</h2>
                {loadingDetails && <span role="status" className="text-xs text-blue-600">Hamkorlar yuklanmoqda...</span>}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {serviceBlocks.map((name) => {
                  const count = allRows.filter((row) => row.service === name).length;
                  const active = serviceFilter === name;
                  return <button type="button" key={name} onClick={() => setServiceFilter(active ? "all" : name)} aria-pressed={active} className={active ? "rounded-xl border border-blue-400 bg-blue-50 p-3 text-left" : "rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-blue-200"}>
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="mt-1 text-xs text-slate-500">{count} ta natija</p>
                  </button>;
                })}
              </div>
              {serviceFilter !== "all" && <button type="button" className="mt-2 text-xs font-semibold text-blue-600 underline" onClick={() => setServiceFilter("all")}>Barcha xizmatlarni ko‘rsatish</button>}
            </div>

            <div className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h2 className="font-bold">Hamkorlar va kelgan takliflar</h2><p className="mt-1 text-xs text-slate-500">Bir hamkorning ayni xizmatga tegishli takroriy yozuvlari birlashtiriladi. Turli valyutalar kurs bo‘yicha solishtirilmaydi.</p></div>
                <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">{filteredRows.length} та</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs font-semibold text-slate-500">Holat
                  <select value={rowFilter} onChange={(event) => setRowFilter(event.target.value as RowFilter)} className={fieldClass + " mt-1"}>
                    <option value="all">Barchasi</option><option value="responded">Javob kelgan</option><option value="waiting">Javob kutilmoqda</option><option value="matched">Mos hamkorlar</option><option value="saved">Saqlangan variantlar</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-500">Xizmat
                  <select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)} className={fieldClass + " mt-1"}>
                    <option value="all">Barcha xizmatlar</option>{allServices.filter((name) => serviceBlocks.includes(name)).map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-500">Saralash
                  <select value={sort} onChange={(event) => setSort(event.target.value as RfqSort)} className={fieldClass + " mt-1"}>
                    <option value="match">Moslik darajasi</option><option value="price">Narx (valyuta guruhlari)</option><option value="location">Joylashuv</option><option value="service">Xizmat turi</option><option value="reply">Javob tezligi</option><option value="newest">Eng yangi</option>
                  </select>
                </label>
              </div>
              {detailError && <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{detailError}</p>}
              <div className="mt-4 space-y-2">
                {!loadingDetails && !filteredRows.length && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Hozircha bu tanlov bo‘yicha ma’lumot йўқ. Агар ҳамкорлар ҳали жавоб бермаган бўлса, кейинроқ “Yangilash”ни босинг.</p>}
                {filteredRows.map((row) => <div key={row.key} className="rounded-xl border border-slate-200 p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[#0b1f3a]">{row.company}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.service} · {row.channel === "agent" ? "Ichki agent taklifi" : "Tashqi hamkor"}{row.location ? " · " + row.location : ""}</p>
                    </div>
                    <span className={"rounded-lg px-2.5 py-1 text-[11px] font-semibold " + statusClass(row)}>{statusText(row)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
                    <span className="font-bold text-[#0b1f3a]">{amount(row)}</span>
                    {row.score !== null && <span>Moslik: {row.score}</span>}
                    {row.responseHours !== null && <span>Javob: {row.responseHours} soatda</span>}
                    {row.respondedAt && <span>{formatDate(row.respondedAt)}</span>}
                  </div>
                  {row.note && <p className="mt-2 break-words text-xs text-slate-500">{row.note}</p>}
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <button type="button" aria-pressed={savedRows.includes(row.key)} onClick={() => toggleRow(row.key)} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">{savedRows.includes(row.key) ? "★ Saqlangan" : "☆ Variantni saqlash"}</button>
                    <Link href={"/requests/" + row.requestId} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50">So‘rov tafsilotlari</Link>
                  </div>
                </div>)}
              </div>
            </div>

            <div className={cardClass}>
              <h2 className="font-bold">Asl matn va tahlil</h2>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">Asl so‘rov matni</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">{original || "Asl matn saqlanmagan."}</p></div>
                <div className="rounded-xl bg-blue-50 p-3"><p className="text-xs font-semibold text-blue-800">Aniqlashtirilgan tuzilma</p>
                  <div className="mt-2 space-y-2">{members.map((item) => <p key={item.id} className="text-sm text-slate-700"><span className="font-semibold">{item.category}</span> · {[item.origin, item.destination].filter(Boolean).join(" → ") || "Joy ko‘rsatilmagan"} · {item.travel_date || "Sana noma’lum"} · {item.adults + item.children + item.infants} kishi</p>)}</div>
                </div>
                <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-800">Aniqlashtirish kerak bo‘lgan joylar</p>
                  {issueMessages.length ? <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700">{issueMessages.map((message) => <li key={message}>{message}</li>)}</ul> : <p className="mt-2 text-sm text-slate-700">Majburiy maydonlar bo‘yicha aniqlangan kamchilik yo‘q.</p>}
                </div>
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-800">Tavsiya</p>
                  <p className="mt-2 text-sm text-slate-700">{waiting > 0 ? "Javobi kutilayotgan hamkorlarni kuzating; mavjud takliflarni xizmat, narx va moslik bo‘yicha solishtiring." : responded > 0 ? "Kelgan takliflar shartlarini taqqoslang. Turli valyutani bitta kursga keltirmasdan eng arzon variantni tanlamang." : "Mos hamkorlarni ko‘rib chiqing. Hali javob yoki mos hamkor topilmagan bo‘lishi mumkin."}</p>
                  <p className="mt-2 text-[11px] text-emerald-800">Бу бўлим сақланган майдонлар ва текширув қоидалари асосида тузилган; янги AI API чақируви амалга оширилмайди.</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500">Бу панель серверда маълумот ўзгартирмайди ва хабар юбормайди. Юлдузланган сўров ва вариантлар фақат шу браузерда, шу аккаунт учун сақланади. Ягона RFQга боғлаш бир хил асл матн ва яратилиш вақти асосида тахминий амалга оширилади.</p>
          </>}
        </section>
      </div>
    </div>
  </AppShell>;
}
