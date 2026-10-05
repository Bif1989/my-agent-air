import { tashkentDate } from "@/lib/request-freshness";
import { splitServiceDetails } from "@/lib/request-details";

export const SERVICE_CATEGORIES = ["Aviachipta", "Tur paket", "Mehmonxona", "Transfer", "Gid", "Viza", "Boshqa"] as const;
export type ServiceCategory = typeof SERVICE_CATEGORIES[number];
export type ServiceData = Record<string, string>;
export type Label = readonly [string, string];
export type Choice = readonly [string, string, string];
export type ServiceField = {
  key: string; label: Label; type?: "text" | "date" | "time" | "number" | "select" | "textarea";
  required?: boolean; options?: readonly Choice[]; min?: number; max?: number; step?: number;
  when?: readonly [string, string]; hint?: Label; maxLength?: number;
};
export type ServiceDefinition = {
  label: Label; origin?: Label; destination: Label; date: Label; example: Label; fields: ServiceField[];
};
export const localize = (label: Label, isRu = false) => label[isRu ? 1 : 0];
const field = (key: string, uz: string, ru: string, extra: Omit<ServiceField, "key" | "label"> = {}): ServiceField => ({ key, label: [uz, ru], ...extra });
const mealPlan = field("meal_plan", "Ovqatlanish", "Питание", { type: "select", options: [["room_only", "Ovqatsiz (RO)", "Без питания (RO)"], ["breakfast", "Nonushta (BB)", "Завтрак (BB)"], ["half_board", "Nonushta va kechki ovqat (HB)", "Завтрак и ужин (HB)"], ["full_board", "Uch mahal (FB)", "Трёхразовое (FB)"], ["all_inclusive", "Hammasi ichida (AI)", "Всё включено (AI)"], ["ultra_all_inclusive", "Ultra hammasi ichida (UAI)", "Ультра всё включено (UAI)"]] });
const stars = field("hotel_stars", "Mehmonxona darajasi", "Категория отеля", { type: "select", options: [["any", "Farqi yo‘q", "Не важно"], ["3", "3 yulduz", "3 звезды"], ["4", "4 yulduz", "4 звезды"], ["5", "5 yulduz", "5 звёзд"]] });

export const SERVICE_DEFINITIONS: Record<ServiceCategory, ServiceDefinition> = {
  Aviachipta: {
    label: ["Aviachipta", "Авиабилет"], origin: ["Uchish shahri / aeroporti", "Город / аэропорт вылета"], destination: ["Borish shahri / aeroporti", "Город / аэропорт назначения"], date: ["Uchish sanasi", "Дата вылета"],
    example: ["Toshkent–Istanbul, 12 noyabr, qaytish 19 noyabr, 2 katta, ekonom, 23 kg bagaj.", "Ташкент–Стамбул, 12 ноября, обратно 19 ноября, 2 взрослых, эконом, багаж 23 кг."],
    fields: [
      field("trip_type", "Safar turi", "Тип поездки", { type: "select", required: true, options: [["one_way", "Bir tomonga", "В одну сторону"], ["round_trip", "Borish–qaytish", "Туда–обратно"], ["multi_city", "Murakkab yo‘nalish", "Сложный маршрут"]] }),
      field("return_date", "Qaytish sanasi", "Дата обратного вылета", { type: "date", required: true, when: ["trip_type", "round_trip"] }),
      field("route_details", "Qolgan yo‘nalishlar va sanalar", "Остальные перелёты и даты", { type: "textarea", required: true, when: ["trip_type", "multi_city"], maxLength: 600, hint: ["Har bir parvozni alohida qatorda: shahar → shahar, sana.", "Каждый перелёт с новой строки: город → город, дата."] }),
      field("cabin_class", "Xizmat klassi", "Класс обслуживания", { type: "select", options: [["economy", "Ekonom", "Эконом"], ["premium_economy", "Premium ekonom", "Премиум-эконом"], ["business", "Biznes", "Бизнес"], ["first", "Birinchi", "Первый"]] }),
      field("flight_preference", "Parvoz talabi", "Предпочтение по пересадкам", { type: "select", options: [["any", "Peresadka mumkin", "Можно с пересадкой"], ["direct", "Faqat to‘g‘ridan-to‘g‘ri", "Только прямой"]] }),
      field("airline", "Afzal aviakompaniya", "Предпочтительная авиакомпания"),
      field("date_flexibility", "Sana moslashuvchanligi", "Гибкость дат", { type: "select", options: [["exact", "Faqat ko‘rsatilgan sana", "Только указанная дата"], ["1", "±1 kun", "±1 день"], ["3", "±3 kun", "±3 дня"], ["7", "±7 kun", "±7 дней"]] }),
    ],
  },
  "Tur paket": {
    label: ["Tur paket", "Турпакет"], origin: ["Jo‘nash shahri", "Город отправления"], destination: ["Davlat / kurort / marshrut", "Страна / курорт / маршрут"], date: ["Tur boshlanish sanasi", "Дата начала тура"],
    example: ["Chustdan Samarqandga 3 kunlik tur, 12 kishi, avtobus, 2 tun, nonushta bilan.", "Тур из Чуста в Самарканд на 3 дня, 12 человек, автобус, 2 ночи, завтраки."],
    fields: [
      field("transport", "Asosiy transport", "Основной транспорт", { type: "select", required: true, options: [["flight", "Samolyot", "Самолёт"], ["bus", "Avtobus / miniven", "Автобус / минивэн"], ["train", "Poyezd", "Поезд"], ["own", "O‘z transportida", "Своим транспортом"]] }),
      field("duration_days", "Davomiyligi (kun)", "Продолжительность (дней)", { type: "number", required: true, min: 1, max: 366 }),
      field("nights", "Tunlar soni", "Количество ночей", { type: "number", min: 0, max: 365, hint: ["Bir kunlik tur uchun 0 tun.", "Для однодневного тура — 0 ночей."] }),
      stars, mealPlan,
      field("room_type", "Joylashuv / xona talabi", "Размещение / тип номера"),
      field("included_services", "Paketga kirishi kerak", "Что должно входить в пакет", { type: "textarea", maxLength: 600, hint: ["Masalan: transport, mehmonxona, gid, kirish chiptalari.", "Например: транспорт, отель, гид, входные билеты."] }),
    ],
  },
  Mehmonxona: {
    label: ["Mehmonxona", "Отель"], destination: ["Mehmonxona shahri / hududi", "Город / район отеля"], date: ["Kirish sanasi", "Дата заезда"],
    example: ["Samarqandda 12–15 noyabr, 2 xona, 3 katta va 7 yoshli bola, nonushta bilan.", "Самарканд, 12–15 ноября, 2 номера, 3 взрослых и ребёнок 7 лет, завтраки."],
    fields: [
      field("check_out", "Chiqish sanasi", "Дата выезда", { type: "date", required: true }),
      field("rooms", "Xonalar soni", "Количество номеров", { type: "number", required: true, min: 1, max: 500 }),
      field("hotel_name", "Mehmonxona nomi (agar tanlangan bo‘lsa)", "Название отеля (если выбран)"),
      stars, mealPlan,
      field("room_type", "Xona / yotoq turi", "Тип номера / кроватей", { hint: ["Masalan: 1 DBL va 1 TWIN, qo‘shimcha yotoq.", "Например: 1 DBL и 1 TWIN, дополнительная кровать."] }),
      field("room_distribution", "Mehmonlarni xonalarga taqsimlash", "Распределение гостей по номерам", { type: "textarea", maxLength: 600 }),
      field("guest_nationality", "Mehmonlar fuqaroligi", "Гражданство гостей"),
      field("cancellation", "Bekor qilish talabi", "Условия отмены", { type: "select", options: [["flexible", "Bepul bekor qilish imkoniyati", "Возможность бесплатной отмены"], ["any", "Har qanday tarif", "Любой тариф"]] }),
    ],
  },
  Transfer: {
    label: ["Transfer / transport", "Трансфер / транспорт"], origin: ["Olib ketish manzili", "Адрес подачи"], destination: ["Olib borish manzili / marshrut", "Адрес назначения / маршрут"], date: ["Jo‘nash sanasi", "Дата отправления"],
    example: ["Toshkent aeroportidan Samarqandga, 12 noyabr 10:30, 6 kishi, miniven, 4 chamadon.", "Из аэропорта Ташкента в Самарканд, 12 ноября в 10:30, 6 человек, минивэн, 4 чемодана."],
    fields: [
      field("transfer_type", "Transport xizmati", "Тип транспортной услуги", { type: "select", required: true, options: [["one_way", "Bir tomonga", "В одну сторону"], ["round_trip", "Borish–qaytish", "Туда–обратно"], ["hourly", "Soatbay ijaraga", "Почасовая аренда"]] }),
      field("pickup_time", "Olib ketish vaqti (mahalliy)", "Время подачи (местное)", { type: "time", required: true }),
      field("vehicle", "Transport turi / sig‘imi", "Тип / вместимость транспорта", { required: true, hint: ["Sedan, 8 o‘rinli Staria, 18 o‘rinli Sprinter, avtobus…", "Седан, Staria на 8 мест, Sprinter на 18 мест, автобус…"] }),
      field("return_date", "Qaytish sanasi", "Дата возвращения", { type: "date", required: true, when: ["transfer_type", "round_trip"] }),
      field("return_time", "Qaytish vaqti (mahalliy)", "Время возвращения (местное)", { type: "time", required: true, when: ["transfer_type", "round_trip"] }),
      field("duration_hours", "Ijara davomiyligi (soat)", "Срок аренды (часов)", { type: "number", required: true, min: 1, max: 720, when: ["transfer_type", "hourly"] }),
      field("flight_number", "Reys / poyezd raqami", "Номер рейса / поезда"),
      field("luggage_count", "Chamadonlar soni", "Количество чемоданов", { type: "number", min: 0, max: 1000 }),
      field("child_seats", "Bolalar o‘rindig‘i soni", "Количество детских кресел", { type: "number", min: 0, max: 500 }),
      field("route_details", "Yo‘ldagi to‘xtashlar / shartlar", "Остановки / условия маршрута", { type: "textarea", maxLength: 600 }),
    ],
  },
  Gid: {
    label: ["Gid", "Гид"], destination: ["Ekskursiya shahri / hududi", "Город / район экскурсии"], date: ["Xizmat sanasi", "Дата услуги"],
    example: ["Buxoroda rus tilida gid, 12 noyabr, 4 soat, 10 kishi, eski shahar bo‘ylab.", "Гид в Бухаре на русском языке, 12 ноября, 4 часа, 10 человек, старый город."],
    fields: [
      field("language", "Gid tili", "Язык гида", { required: true }),
      field("duration_hours", "Kuniga davomiyligi (soat)", "Продолжительность в день (часов)", { type: "number", required: true, min: 0.5, max: 24, step: 0.5 }),
      field("duration_days", "Kunlar soni", "Количество дней", { type: "number", min: 1, max: 365 }),
      field("route_details", "Ekskursiya yo‘nalishi / obyektlar", "Маршрут / объекты экскурсии", { type: "textarea", required: true, maxLength: 600 }),
      field("start_time", "Boshlanish vaqti (mahalliy)", "Время начала (местное)", { type: "time" }),
      field("guide_type", "Xizmat turi", "Вид услуги", { type: "select", options: [["walking", "Piyoda ekskursiya", "Пешеходная экскурсия"], ["with_transport", "Gid va transport", "Гид с транспортом"], ["interpreter", "Tarjimonlik / hamrohlik", "Перевод / сопровождение"]] }),
    ],
  },
  Viza: {
    label: ["Viza", "Виза"], destination: ["Viza olinadigan davlat", "Страна визы"], date: ["Rejalashtirilgan kirish sanasi", "Планируемая дата въезда"],
    example: ["O‘zbekiston fuqarosi uchun Polshaga turistik viza, 12 noyabrdan 15 kun, Toshkentda topshirish.", "Туристическая виза в Польшу для гражданина Узбекистана, с 12 ноября на 15 дней, подача в Ташкенте."],
    fields: [
      field("nationality", "Arizachilar fuqaroligi", "Гражданство заявителей", { required: true }),
      field("residence_country", "Yashash davlati", "Страна проживания", { required: true }),
      field("visa_purpose", "Safar maqsadi", "Цель поездки", { type: "select", required: true, options: [["tourism", "Turizm", "Туризм"], ["business", "Biznes", "Бизнес"], ["visit", "Mehmon / qarindosh", "Гостевая"], ["study", "O‘qish", "Учёба"], ["work", "Ish", "Работа"], ["transit", "Tranzit", "Транзит"], ["other", "Boshqa", "Другое"]] }),
      field("duration_days", "Davlatda qolish muddati (kun)", "Срок пребывания (дней)", { type: "number", required: true, min: 1, max: 3650 }),
      field("visa_service", "Kerakli yordam", "Необходимая помощь", { type: "select", required: true, options: [["consultation", "Maslahat", "Консультация"], ["documents", "Hujjat tayyorlash", "Подготовка документов"], ["appointment", "Qabulga yozilish", "Запись на подачу"], ["full_support", "To‘liq ko‘mak", "Полное сопровождение"]] }),
      field("submission_city", "Hujjat topshirish shahri", "Город подачи документов"),
      field("visa_entries", "Kirishlar soni", "Количество въездов", { type: "select", options: [["single", "Bir marta", "Однократная"], ["double", "Ikki marta", "Двукратная"], ["multiple", "Ko‘p martalik", "Многократная"]] }),
    ],
  },
  Boshqa: {
    label: ["Boshqa xizmat", "Другая услуга"], destination: ["Xizmat shahri / manzili", "Город / адрес услуги"], date: ["Xizmat sanasi", "Дата услуги"],
    example: ["Samarqandda 12 noyabr 13:00 da 20 kishiga guruh tushligi, halol taomlar.", "Групповой обед в Самарканде 12 ноября в 13:00 на 20 человек, халяльное меню."],
    fields: [
      field("service_name", "Xizmat nomi", "Название услуги", { required: true, hint: ["Restoran, muzey chiptasi, sug‘urta, tadbir…", "Ресторан, билеты в музей, страховка, мероприятие…"] }),
      field("quantity", "Miqdor", "Количество", { type: "number", required: true, min: 1, max: 5000 }),
      field("unit", "O‘lchov birligi", "Единица измерения", { type: "select", required: true, options: [["person", "Kishi", "Человек"], ["ticket", "Chipta", "Билет"], ["meal", "Taom / porsiya", "Порция"], ["hour", "Soat", "Час"], ["item", "Dona / xizmat", "Штука / услуга"]] }),
      field("start_time", "Xizmat vaqti (mahalliy)", "Время услуги (местное)", { type: "time" }),
    ],
  },
};

export const COMMON_SERVICE_FIELDS: ServiceField[] = [
  field("child_ages", "Bolalar yoshi", "Возраст детей", { maxLength: 2000, hint: ["Safar kunidagi yosh, vergul bilan: 5, 8. Har bir bola uchun bittadan.", "Возраст на дату поездки через запятую: 5, 8. Для каждого ребёнка."] }),
  field("infant_ages_months", "Go‘daklar yoshi (oy)", "Возраст младенцев (месяцев)", { maxLength: 2000, hint: ["Masalan: 8, 18. Har bir go‘dak uchun bittadan.", "Например: 8, 18. Для каждого младенца."] }),
  field("budget_basis", "Budjet nimaga hisoblangan?", "За что указан бюджет?", { type: "select", options: [["total", "Jami xizmat uchun", "За всю услугу"], ["per_person", "Bir kishiga", "За человека"], ["per_room_night", "Bir xona / bir tun", "За номер / ночь"], ["per_person_night", "Bir kishi / bir tun", "За человека / ночь"], ["per_vehicle", "Bir transportga", "За транспорт"], ["per_hour", "Bir soatga", "За час"], ["per_day", "Bir kunga", "За день"], ["per_unit", "Bir dona / xizmatga", "За единицу"]] }),
];

export function serviceDefinition(category?: string | null): ServiceDefinition | undefined {
  return SERVICE_CATEGORIES.includes(category as ServiceCategory) ? SERVICE_DEFINITIONS[category as ServiceCategory] : undefined;
}
export function serviceFields(category?: string | null) { const definition = serviceDefinition(category); return definition ? [...definition.fields, ...COMMON_SERVICE_FIELDS] : []; }
export function fieldVisible(item: ServiceField, details: ServiceData) { return !item.when || details[item.when[0]] === item.when[1]; }
export function sanitizeServiceData(category: string | undefined | null, value: unknown): ServiceData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return Object.fromEntries(serviceFields(category).flatMap((item) => {
    const raw = input[item.key];
    const text = (typeof raw === "string" || typeof raw === "number") ? String(raw).trim().slice(0, item.maxLength ?? 160) : "";
    return text ? [[item.key, text]] : [];
  }));
}
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function daysBetween(start?: string | null, end?: string | null) { return isCalendarDate(start) && isCalendarDate(end) ? (Date.parse(end) - Date.parse(start)) / 86400000 : null; }
export function addCalendarDays(start: string, days: number) { return isCalendarDate(start) && Number.isInteger(days) && Math.abs(days) <= 3650 ? new Date(Date.parse(start) + days * 86400000).toISOString().slice(0, 10) : ""; }

export type ServiceRequestInput = {
  category?: string | null; origin?: string | null; destination?: string | null; travel_date?: string | null;
  adults?: number; children?: number; infants?: number; baggage?: string | null; budget?: number | null; currency?: string;
  description?: string | null; service_details?: ServiceData; form_version?: number;
};

// Read the original description trailer without modifying historical rows or losing free text.
export function hydrateServiceRequest<T extends ServiceRequestInput>(input: T): T & { service_details: ServiceData; description: string } {
  const legacy = splitServiceDetails(input.description);
  const details = { ...sanitizeServiceData(input.category, legacy.details), ...sanitizeServiceData(input.category, input.service_details) };
  if (input.category === "Mehmonxona" && !details.check_out && /^\d+$/.test(legacy.details.nights)) {
    const end = addCalendarDays(input.travel_date || "", Number(legacy.details.nights));
    if (end) details.check_out = end;
  }
  const definition = serviceDefinition(input.category);
  return { ...input, origin: definition?.origin ? input.origin : null, destination: definition && !definition.origin ? input.destination || input.origin : input.destination, description: legacy.text, service_details: details };
}

export type RequestIssue = { field: string; message: string };
export function requestIssues(input: ServiceRequestInput, isRu = false, now = new Date()): RequestIssue[] {
  const issues: RequestIssue[] = [];
  const add = (key: string, uz: string, ru: string) => { if (!issues.some((item) => item.field === key)) issues.push({ field: key, message: isRu ? ru : uz }); };
  const definition = serviceDefinition(input.category);
  if (!definition) { add("category", "Xizmat turini tanlang.", "Выберите вид услуги."); return issues; }
  for (const [key, label] of [["origin", definition.origin], ["destination", definition.destination]] as const) {
    if (!label) continue;
    if (!input[key]?.trim()) add(key, `${label[0]}ni kiriting.`, `Укажите: ${label[1].toLowerCase()}.`);
    else if (input[key]!.length > 120) add(key, "Manzil 120 belgidan oshmasin.", "Адрес не должен превышать 120 символов.");
  }
  if (input.category === "Aviachipta" && input.origin?.trim().toLowerCase() === input.destination?.trim().toLowerCase()) add("destination", "Uchish va borish aeroporti bir xil bo‘lmasin.", "Аэропорты вылета и назначения должны отличаться.");
  if (!isCalendarDate(input.travel_date) || input.travel_date < tashkentDate(now)) add("travel_date", `${definition.date[0]}ni bugun yoki keyingi sanaga kiriting.`, `Укажите корректную дату: ${definition.date[1].toLowerCase()}, не в прошлом.`);
  for (const key of ["adults", "children", "infants"] as const) if (!Number.isInteger(input[key]) || input[key]! < (key === "adults" ? 1 : 0) || input[key]! > 500) add(key, key === "adults" ? "Kattalar soni 1–500 oralig‘ida bo‘lsin." : "Bolalar va go‘daklar soni 0–500 oralig‘ida bo‘lsin.", key === "adults" ? "Взрослых должно быть от 1 до 500." : "Количество детей и младенцев — от 0 до 500.");
  if (input.category === "Aviachipta" && (input.infants || 0) > (input.adults || 0)) add("infants", "Alohida o‘rinsiz go‘daklar soni kattalardan oshmasin.", "Младенцев без отдельного места не должно быть больше взрослых.");
  const details = input.service_details || {};
  for (const item of definition.fields) {
    if (!fieldVisible(item, details)) continue;
    const value = details[item.key] || "";
    const key = `service_details.${item.key}`;
    if (!value) { if (item.required) add(key, `${item.label[0]}ni kiriting.`, `Укажите: ${item.label[1].toLowerCase()}.`); continue; }
    let valid = value.length <= (item.maxLength ?? 160);
    if (item.type === "select") valid = valid && Boolean(item.options?.some(([choice]) => choice === value));
    if (item.type === "number") valid = valid && /^\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Number(value) >= (item.min ?? 0) && Number(value) <= (item.max ?? 500) && Number.isInteger(Number(value) / (item.step ?? 1));
    if (item.type === "date") valid = valid && isCalendarDate(value);
    if (item.type === "time") valid = valid && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!valid) add(key, `${item.label[0]} noto‘g‘ri kiritilgan.`, `Проверьте поле «${item.label[1]}».`);
  }
  for (const [countKey, ageKey, low, high] of [["children", "child_ages", 2, input.category === "Aviachipta" ? 11 : 17], ["infants", "infant_ages_months", 0, 23]] as const) {
    const count = input[countKey] || 0;
    if (count > 0 && ["Aviachipta", "Mehmonxona", "Tur paket"].includes(input.category || "") || details[ageKey]) {
      const ages = (details[ageKey] || "").split(",").map((age) => age.trim());
      if (ages.length !== count || ages.some((age) => !/^\d{1,2}$/.test(age) || Number(age) < low || Number(age) > high)) add(`service_details.${ageKey}`, `${count} ta ${countKey === "children" ? `bolaning yoshini (${low}–${high} yosh)` : "go‘dak yoshini (0–23 oy)"} vergul bilan kiriting.`, `Укажите возраст ${count} ${countKey === "children" ? `детей (${low}–${high} лет)` : "младенцев (0–23 месяца)"} через запятую.`);
    }
  }
  if (details.check_out && input.category === "Mehmonxona") {
    const nights = daysBetween(input.travel_date, details.check_out);
    if (nights === null || nights < 1 || nights > 365) add("service_details.check_out", "Chiqish sanasi kirishdan keyin, 1–365 tun oralig‘ida bo‘lsin.", "Выезд должен быть после заезда: от 1 до 365 ночей.");
  }
  if (details.return_date && (details.trip_type === "round_trip" || details.transfer_type === "round_trip")) {
    const gap = daysBetween(input.travel_date, details.return_date);
    if (gap === null || gap < 0) add("service_details.return_date", "Qaytish sanasi jo‘nashdan oldin bo‘lmasin.", "Обратная дата не может быть раньше отправления.");
    if (input.category === "Transfer" && gap === 0 && details.return_time <= details.pickup_time) add("service_details.return_time", "Qaytish vaqti jo‘nashdan keyin bo‘lsin.", "Время возвращения должно быть позже отправления.");
  }
  if (input.category === "Tur paket" && details.nights && details.duration_days && Number(details.nights) >= Number(details.duration_days)) add("service_details.nights", "Tunlar soni tur kunlaridan kam bo‘lsin.", "Количество ночей должно быть меньше количества дней тура.");
  if (input.budget != null) {
    if (!Number.isFinite(input.budget) || input.budget <= 0 || input.budget > 1e12) add("budget", "Budjet 0 dan katta bo‘lsin yoki maydonni bo‘sh qoldiring.", "Укажите бюджет больше 0 или оставьте поле пустым.");
    if (!COMMON_SERVICE_FIELDS[2].options?.some(([value]) => value === details.budget_basis)) add("service_details.budget_basis", "Budjet nimaga hisoblanganini tanlang.", "Укажите, за что рассчитан бюджет.");
    if (!["USD", "UZS", "EUR", "RUB"].includes(input.currency || "")) add("currency", "Valyutani tanlang.", "Выберите валюту.");
  }
  if ((input.description?.length || 0) > 1000) add("description", "Izoh 1000 belgidan oshmasin.", "Комментарий не должен превышать 1000 символов.");
  return issues;
}

export function cleanServiceData(input: ServiceRequestInput): ServiceData {
  const details = sanitizeServiceData(input.category, input.service_details);
  for (const item of serviceFields(input.category)) if (!fieldVisible(item, details)) delete details[item.key];
  if (!input.children) delete details.child_ages;
  if (!input.infants) delete details.infant_ages_months;
  if (input.budget == null) delete details.budget_basis;
  return details;
}

export function requestTitle(input: Pick<ServiceRequestInput, "category" | "origin" | "destination">) {
  const locationOnly = !serviceDefinition(input.category)?.origin;
  return locationOnly ? input.destination || input.origin || input.category || "—" : [input.origin, input.destination].filter(Boolean).join(" → ") || "—";
}
export function hasAirTravel(input: Pick<ServiceRequestInput, "category" | "service_details">) {
  return input.category === "Aviachipta" || (input.category === "Tur paket" && (!input.service_details?.transport || input.service_details.transport === "flight"));
}
export function requestBudget(input: ServiceRequestInput, isRu = false) {
  if (input.budget == null) return isRu ? "Бюджет не указан" : "Budjet ko‘rsatilmagan";
  const basis = COMMON_SERVICE_FIELDS[2].options?.find(([key]) => key === input.service_details?.budget_basis);
  return `${input.budget.toLocaleString(isRu ? "ru-RU" : "uz-UZ")} ${input.currency || ""}${basis ? ` · ${basis[isRu ? 2 : 1]}` : ""}`;
}
export function serviceDetailEntries(input: ServiceRequestInput, isRu = false) {
  const hydrated = hydrateServiceRequest(input);
  return serviceFields(input.category).flatMap((item) => {
    const value = hydrated.service_details[item.key];
    if (!value || !fieldVisible(item, hydrated.service_details)) return [];
    const choice = item.options?.find(([key]) => key === value);
    return [{ key: item.key, label: localize(item.label, isRu), value: choice ? choice[isRu ? 2 : 1] : value }];
  });
}
