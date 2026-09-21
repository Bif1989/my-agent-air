"use client";

import { useState } from "react";
import { getAirlineByCode } from "@/data/airlines";
import { searchAirlines } from "@/lib/aviation-assist";

type AirlineSmartInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export default function AirlineSmartInput({ value, onChange, placeholder, className, disabled }: AirlineSmartInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = getAirlineByCode(value);
  const suggestions = value.trim() && !selected ? searchAirlines(value, 6) : [];

  function handleChange(nextValue: string) {
    onChange(nextValue);
    setIsOpen(Boolean(nextValue.trim()));
  }

  function selectAirline(code: string) {
    onChange(code);
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => setIsOpen(Boolean(value.trim()) && !selected)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 100)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
      {selected && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-700">
          <span className="rounded-md bg-emerald-50 px-2 py-1">[ {selected.code} ]</span>
          <span>{selected.name}</span>
          <span>✓ Tanlangan</span>
        </p>
      )}
      {isOpen && suggestions.length > 0 && (
        <ul role="listbox" className="absolute left-0 top-full z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={suggestion.code} role="option">
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectAirline(suggestion.code);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[#0b1f3a] transition hover:bg-emerald-50"
              >
                <span aria-hidden="true">🛫</span>
                <span className="font-semibold text-emerald-700">{suggestion.code}</span>
                <span className="min-w-0 flex-1 truncate">{suggestion.name}</span>
                <span className="hidden truncate text-xs text-slate-400 sm:inline">{suggestion.country}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
