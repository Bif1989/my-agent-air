"use client";

type SectionKind = "clarification" | "note" | "suggestion" | "warning";

type Section = { kind: SectionKind; text: string };

const markerPattern = /\[\[(clarification|note|suggestion|warning)\]\]([\s\S]*?)\[\[\/\1\]\]/gi;

function normalizeLegacySections(text: string) {
  const hasStructuredClarification = /\[\[clarification\]\]/i.test(text);
  const hasStructuredSuggestion = /\[\[suggestion\]\]/i.test(text);

  return text
    .replace(/(?:^|\n\n)(Aniqlashtirish kerak|Yetishmayotgan ma’lumot|Нужно уточнить):\s*([^\n]+)/gi, (_match, _label, value) => hasStructuredClarification ? "" : `\n\n[[clarification]]${String(value).trim()}[[/clarification]]`)
    .replace(/(?:^|\n\n)(Muhim izoh|Izoh|Важное примечание|Примечание):\s*([^\n]+)/gi, (_match, _label, value) => `\n\n[[note]]${String(value).trim()}[[/note]]`)
    .replace(/(?:^|\n\n)(Qo‘shimcha taklif|Qo'shimcha taklif|Ichki turizm tavsiyasi|Совет|Дополнительное предложение|Рекомендация):\s*([^\n]+)/gi, (_match, _label, value) => hasStructuredSuggestion ? "" : `\n\n[[suggestion]]${String(value).trim()}[[/suggestion]]`)
    .replace(/(?:^|\n\n)(Ogohlantirish|Внимание|Предупреждение):\s*([^\n]+)/gi, (_match, _label, value) => `\n\n[[warning]]${String(value).trim()}[[/warning]]`);
}

function normalizeSectionKey(kind: SectionKind, value: string) {
  return `${kind}:${value.toLocaleLowerCase().replace(/[•*\-–—?:;,.!()]/g, " ").replace(/\s+/g, " ").trim()}`;
}

function parseSections(input: string) {
  const text = normalizeLegacySections(input);
  const sections: Section[] = [];
  const seenSections = new Set<string>();
  const plainParts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  markerPattern.lastIndex = 0;
  while ((match = markerPattern.exec(text))) {
    const before = text.slice(lastIndex, match.index).trim();
    if (before) plainParts.push(before);
    const value = match[2].trim();
    const kind = match[1].toLowerCase() as SectionKind;
    const key = normalizeSectionKey(kind, value);
    if (value && !seenSections.has(key)) {
      seenSections.add(key);
      sections.push({ kind, text: value });
    }
    lastIndex = markerPattern.lastIndex;
  }
  const rest = text.slice(lastIndex).trim();
  if (rest) plainParts.push(rest);
  return { plain: plainParts.join("\n\n"), sections };
}

function sectionMeta(kind: SectionKind, isRu: boolean) {
  if (kind === "clarification") return {
    label: isRu ? "Нужно уточнить" : "Aniqlashtirish kerak",
    icon: "?",
    className: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-100",
    labelClass: "text-amber-700 dark:text-amber-300",
  };
  if (kind === "suggestion") return {
    label: isRu ? "Дополнительное предложение" : "Qo‘shimcha taklif",
    icon: "+",
    className: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-100",
    labelClass: "text-emerald-700 dark:text-emerald-300",
  };
  if (kind === "warning") return {
    label: isRu ? "Внимание" : "Ogohlantirish",
    icon: "!",
    className: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-100",
    labelClass: "text-rose-700 dark:text-rose-300",
  };
  return {
    label: isRu ? "Примечание" : "Izoh",
    icon: "i",
    className: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800/70 dark:bg-sky-950/30 dark:text-sky-100",
    labelClass: "text-sky-700 dark:text-sky-300",
  };
}

function sectionItems(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^\s*[•*\-–—]+\s*/, "").trim())
    .filter(Boolean);
  return lines.length ? lines : [text.trim()].filter(Boolean);
}

function sectionTemplate(kind: "clarification" | "suggestion", text: string, isRu: boolean) {
  const items = sectionItems(text);
  if (kind === "clarification") {
    const heading = isRu ? "Ответ на уточнение:" : "Aniqlashtirishga javob:";
    return `${heading}\n${items.map((item) => `• ${item.replace(/[?？]\s*$/, "")} — `).join("\n")}`;
  }
  const heading = isRu ? "Добавьте к текущему запросу:" : "Joriy so‘rovga qo‘shing:";
  return `${heading}\n${items.map((item) => `• ${item}`).join("\n")}`;
}

function fillAiComposer(kind: "clarification" | "suggestion", text: string, isRu: boolean) {
  const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"));
  const textarea = textareas.find((item) => /AI|ИИ/i.test(item.getAttribute("aria-label") || "")) || textareas[0];
  if (!textarea) return;

  const template = sectionTemplate(kind, text, isRu);
  const current = textarea.value.trim();
  const nextValue = (current ? `${current}\n\n${template}` : template).slice(0, textarea.maxLength > 0 ? textarea.maxLength : 1500);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) setter.call(textarea, nextValue);
  else textarea.value = nextValue;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(nextValue.length, nextValue.length);
  textarea.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function AiResponseText({ text, isRu }: { text: string; isRu: boolean }) {
  const { plain, sections } = parseSections(text);
  if (!sections.length) return <>{text}</>;

  return (
    <div className="space-y-2.5">
      {plain && <div className="whitespace-pre-wrap">{plain}</div>}
      {sections.map((section, index) => {
        const meta = sectionMeta(section.kind, isRu);
        const interactive = section.kind === "clarification" || section.kind === "suggestion";
        const content = (
          <>
            <div className={`mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${meta.labelClass}`}>
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px]">{meta.icon}</span>
              <span>{meta.label}</span>
              {interactive && <span className="ml-auto normal-case tracking-normal opacity-70">{isRu ? "Нажмите, чтобы заполнить" : "Bosib to‘ldiring"}</span>}
            </div>
            <div className="whitespace-pre-wrap text-[12px] leading-5 sm:text-[13px]">{section.text}</div>
          </>
        );

        return interactive ? (
          <button
            key={`${section.kind}-${index}`}
            type="button"
            onClick={() => fillAiComposer(section.kind as "clarification" | "suggestion", section.text, isRu)}
            className={`block w-full rounded-xl border px-3 py-2.5 text-left transition hover:-translate-y-px hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 ${meta.className}`}
          >
            {content}
          </button>
        ) : (
          <div key={`${section.kind}-${index}`} className={`rounded-xl border px-3 py-2.5 ${meta.className}`}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
