"use client";

type SectionKind = "clarification" | "note" | "suggestion" | "warning";

type Section = { kind: SectionKind; text: string };

const markerPattern = /\[\[(clarification|note|suggestion|warning)\]\]([\s\S]*?)\[\[\/\1\]\]/gi;

function normalizeLegacySections(text: string) {
  return text
    .replace(/(?:^|\n\n)(Aniqlashtirish kerak|Yetishmayotgan ma’lumot|Нужно уточнить):\s*([^\n]+)/gi, (_match, _label, value) => `\n\n[[clarification]]${String(value).trim()}[[/clarification]]`)
    .replace(/(?:^|\n\n)(Muhim izoh|Izoh|Важное примечание|Примечание):\s*([^\n]+)/gi, (_match, _label, value) => `\n\n[[note]]${String(value).trim()}[[/note]]`)
    .replace(/(?:^|\n\n)(Qo‘shimcha taklif|Qo'shimcha taklif|Ichki turizm tavsiyasi|Совет|Дополнительное предложение|Рекомендация):\s*([^\n]+)/gi, (_match, _label, value) => `\n\n[[suggestion]]${String(value).trim()}[[/suggestion]]`)
    .replace(/(?:^|\n\n)(Ogohlantirish|Внимание|Предупреждение):\s*([^\n]+)/gi, (_match, _label, value) => `\n\n[[warning]]${String(value).trim()}[[/warning]]`);
}

function parseSections(input: string) {
  const text = normalizeLegacySections(input);
  const sections: Section[] = [];
  const plainParts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  markerPattern.lastIndex = 0;
  while ((match = markerPattern.exec(text))) {
    const before = text.slice(lastIndex, match.index).trim();
    if (before) plainParts.push(before);
    const value = match[2].trim();
    if (value) sections.push({ kind: match[1].toLowerCase() as SectionKind, text: value });
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

export function AiResponseText({ text, isRu }: { text: string; isRu: boolean }) {
  const { plain, sections } = parseSections(text);
  if (!sections.length) return <>{text}</>;

  return (
    <div className="space-y-2.5">
      {plain && <div className="whitespace-pre-wrap">{plain}</div>}
      {sections.map((section, index) => {
        const meta = sectionMeta(section.kind, isRu);
        return (
          <div key={`${section.kind}-${index}`} className={`rounded-xl border px-3 py-2.5 ${meta.className}`}>
            <div className={`mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${meta.labelClass}`}>
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px]">{meta.icon}</span>
              {meta.label}
            </div>
            <div className="whitespace-pre-wrap text-[12px] leading-5 sm:text-[13px]">{section.text}</div>
          </div>
        );
      })}
    </div>
  );
}
