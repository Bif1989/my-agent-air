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
        <ul role="listbox" className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.type === "airport" ? `airport-${suggestion.code}` : `template-${suggestion.command}`} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(event) => { event.preventDefault(); applySuggestion(suggestion); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${index === activeIndex ? "bg-blue-50 text-blue-700" : "text-[#0b1f3a] hover:bg-slate-50"}`}
              >
                {suggestion.type === "airport" ? (
                  <>
                    <span aria-hidden="true">✈</span>
                    <span className="font-semibold">{suggestion.code}</span>
                    <span className="text-slate-400">—</span>
                    <span className="truncate text-slate-600">{suggestion.city}</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">⚡</span>
                    <span className="font-semibold">{suggestion.command}</span>
                    <span className="text-slate-400">—</span>
                    <span className="truncate text-slate-600">{suggestion.label}</span>
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
