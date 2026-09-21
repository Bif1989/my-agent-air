"use client";

import { useEffect, useRef, useState } from "react";
import { getLastToken, searchAirports, type AviaSuggestion } from "@/lib/aviation-assist";

type AviaSmartInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  maxLength?: number;
  disabled?: boolean;
  mode?: "airport" | "text";
};

export default function AviaSmartInput({
  value,
  onChange,
  placeholder,
  className,
  maxLength,
  disabled,
  mode = "text",
}: AviaSmartInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<AviaSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCaret.current === null) return;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(caret, caret);
  }, [value]);

  function refreshSuggestions(nextValue: string, cursorPos: number) {
    if (mode === "airport") {
      const query = nextValue.trim();
      const nextSuggestions: AviaSuggestion[] = query
        ? searchAirports(query, 6).map((airport) => ({ type: "airport" as const, ...airport, tokenStart: 0, tokenEnd: nextValue.length }))
        : [];
      setSuggestions(nextSuggestions);
      setActiveIndex(0);
      return;
    }

    const { token, tokenStart, tokenEnd } = getLastToken(nextValue, cursorPos);
    if (!token) {
      setSuggestions([]);
      setActiveIndex(0);
      return;
    }

    const nextSuggestions: AviaSuggestion[] = searchAirports(token, 6).map((airport) => ({ type: "airport" as const, ...airport, tokenStart, tokenEnd }));
    setSuggestions(nextSuggestions);
    setActiveIndex(0);
  }

  function applySuggestion(suggestion: AviaSuggestion) {
    if (suggestion.type !== "airport") return;

    if (mode === "airport") {
      pendingCaret.current = suggestion.code.length;
      onChange(suggestion.code);
      setSuggestions([]);
      setActiveIndex(0);
      return;
    }

    const { tokenStart, tokenEnd } = suggestion;
    const nextValue = `${value.slice(0, tokenStart)}${suggestion.code}${value.slice(tokenEnd)}`;
    pendingCaret.current = tokenStart + suggestion.code.length;
    onChange(nextValue);
    setSuggestions([]);
    setActiveIndex(0);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    onChange(nextValue);
    refreshSuggestions(nextValue, event.target.selectionStart ?? nextValue.length);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const suggestion = suggestions[activeIndex];
      if (suggestion) applySuggestion(suggestion);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setSuggestions([]);
      setActiveIndex(0);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setSuggestions([])}
        onFocus={(event) => refreshSuggestions(event.target.value, event.target.selectionStart ?? event.target.value.length)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className={className}
      />
      {suggestions.length > 0 && (
        <ul role="listbox" className="absolute left-0 top-full z-20 mt-2 w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {suggestions.map((suggestion, index) => {
            if (suggestion.type !== "airport") {
              return null;
            }

            return (
              <li key={`airport-${suggestion.code}-${index}`} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySuggestion(suggestion);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${index === activeIndex ? "bg-blue-50 text-blue-700" : "text-[#0b1f3a] hover:bg-slate-50"}`}
                >
                  <span aria-hidden="true">✈</span>
                  <span className="font-semibold text-blue-700">{suggestion.code}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600">{suggestion.city}</span>
                  {suggestion.airport && <span className="hidden truncate text-slate-400 sm:inline">{suggestion.airport}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
