"use client";

import { useEffect, useRef, useState } from "react";
import { computeAviaSuggestions, type AviaSuggestion } from "@/lib/aviation-assist";

type AviaSmartAssistProps = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  id?: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
  containerClassName?: string;
  disabled?: boolean;
};

export default function AviaSmartAssist({ value, onChange, onKeyDown, id, rows = 3, maxLength, placeholder, className, containerClassName, disabled }: AviaSmartAssistProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<AviaSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCaret.current === null) return;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  }, [value]);

  function refreshSuggestions(nextValue: string, cursorPos: number) {
    const nextSuggestions = computeAviaSuggestions(nextValue, cursorPos);
    setSuggestions(nextSuggestions);
    setActiveIndex(0);
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
    refreshSuggestions(event.target.value, event.target.selectionStart);
  }

  function handleSelect(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const target = event.target as HTMLTextAreaElement;
    refreshSuggestions(target.value, target.selectionStart);
  }

  function applySuggestion(suggestion: AviaSuggestion) {
    if (suggestion.type === "template") {
      pendingCaret.current = suggestion.text.length;
      onChange(suggestion.text);
    } else {
      const nextValue = `${value.slice(0, suggestion.tokenStart)}${suggestion.code}${value.slice(suggestion.tokenEnd)}`;
      pendingCaret.current = suggestion.tokenStart + suggestion.code.length;
      onChange(nextValue);
    }
    setSuggestions([]);
    setActiveIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
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
        applySuggestion(suggestions[activeIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSuggestions([]);
        return;
      }
      return;
    }
    onKeyDown?.(event);
  }

  return (
    <div className={containerClassName || "relative"}>
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        onBlur={() => setSuggestions([])}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
      {suggestions.length > 0 && (
        <ul role="listbox" className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.type === "airport" ? `airport-${suggestion.code}-${index}` : suggestion.type === "airline" ? `airline-${suggestion.code}-${index}` : `template-${suggestion.command}-${index}`} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(event) => { event.preventDefault(); applySuggestion(suggestion); }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${index === activeIndex ? "bg-blue-50" : "hover:bg-slate-50"}`}
              >
                {suggestion.type === "airport" ? (
                  <>
                    <span aria-hidden="true" className="text-sm text-blue-600">✈</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold text-[#0b1f3a]">{suggestion.code}</span>
                        <span className="truncate text-slate-600">{suggestion.city}</span>
                      </div>
                      {suggestion.airport && <div className="truncate text-[11px] text-slate-400">{suggestion.airport} · {suggestion.country}</div>}
                    </div>
                  </>
                ) : suggestion.type === "airline" ? (
                  <>
                    <span aria-hidden="true" className="text-sm text-emerald-600">🛫</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold text-[#0b1f3a]">{suggestion.code}</span>
                        <span className="truncate text-slate-600">{suggestion.name}</span>
                      </div>
                      <div className="truncate text-[11px] text-slate-400">{suggestion.country}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true" className="text-sm text-amber-600">⚡</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold text-[#0b1f3a]">{suggestion.command}</span>
                        <span className="text-slate-500">{suggestion.label}</span>
                      </div>
                    </div>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
