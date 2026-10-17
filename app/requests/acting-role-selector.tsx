"use client";

import type { BillingRoleOption } from "@/lib/billing-roles";

export default function ActingRoleSelector({
  roles,
  value,
  onChange,
  isRu,
  compact = false,
}: {
  roles: BillingRoleOption[];
  value: string;
  onChange: (value: string) => void;
  isRu: boolean;
  compact?: boolean;
}) {
  if (!roles.length) return null;
  if (roles.length === 1) {
    const role = roles[0];
    return <div className={`${compact ? "mb-4" : "mb-6"} rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800`}>
      <span className="font-semibold">{isRu ? "Вы действуете как" : "Sizning yo‘nalishingiz"}:</span> {isRu ? role.ru : role.uz}
      <span className="ml-2 text-xs text-blue-600">· {role.fee.toLocaleString("uz-UZ")} UZS / {isRu ? "сделка" : "bitim"}</span>
    </div>;
  }

  return <label className={`${compact ? "mb-4" : "mb-6"} block rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-900`}>
    {isRu ? "От имени какого направления вы работаете?" : "Qaysi yo‘nalish nomidan ishlayapsiz?"}
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-2 w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-200"
    >
      <option value="">{isRu ? "Выберите направление" : "Yo‘nalishni tanlang"}</option>
      {roles.map((role) => <option key={role.role} value={role.role}>
        {isRu ? role.ru : role.uz} · {role.fee.toLocaleString("uz-UZ")} UZS
      </option>)}
    </select>
    <span className="mt-2 block text-xs font-normal leading-5 text-blue-700">
      {isRu ? "Роль фиксируется в сделке и определяет комиссию после бесплатного лимита." : "Bu rol bitimda saqlanadi va bepul limit tugagach komissiya shu rol bo‘yicha hisoblanadi."}
    </span>
  </label>;
}
