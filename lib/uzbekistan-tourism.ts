import { normalizeAirportSearch } from "@/lib/aviation-assist";

export type DomesticDestination = {
  name: string;
  region: string;
  aliases: string[];
  attractions: string[];
  themes: string[];
};

export const UZBEKISTAN_DESTINATIONS: DomesticDestination[] = [
  { name: "Toshkent", region: "Toshkent", aliases: ["tashkent", "ташкент"], attractions: ["Hazrati Imom majmuasi", "Chorsu bozori", "Amir Temur xiyoboni", "Toshkent City", "teleminora"], themes: ["shahar sayohati", "muzey", "gastronomiya"] },
  { name: "Samarqand", region: "Samarqand", aliases: ["samarkand", "самарканд"], attractions: ["Registon", "Shohi Zinda", "Go‘ri Amir", "Bibixonim", "Ulug‘bek rasadxonasi", "Imom Buxoriy majmuasi"], themes: ["tarix", "ziyorat", "me'morchilik"] },
  { name: "Buxoro", region: "Buxoro", aliases: ["bukhara", "бухара"], attractions: ["Poi Kalon", "Ark qal’asi", "Labi Hovuz", "Somoniylar maqbarasi", "Chor Minor", "Yetti Pir yo‘nalishi"], themes: ["tarix", "ziyorat", "eski shahar"] },
  { name: "Xiva", region: "Xorazm", aliases: ["khiva", "хива", "ichan qala", "ichan-qala"], attractions: ["Ichan-Qal’a", "Kalta Minor", "Ko‘hna Ark", "Tosh Hovli", "Juma masjidi"], themes: ["tarix", "eski shahar", "me'morchilik"] },
  { name: "Urganch", region: "Xorazm", aliases: ["urgench", "ургенч"], attractions: ["Xiva yo‘nalishi", "Xorazm gastronomiyasi"], themes: ["transport hub", "gastronomiya"] },
  { name: "Shahrisabz", region: "Qashqadaryo", aliases: ["shakhrisabz", "шахрисабз"], attractions: ["Oqsaroy", "Dorut Tilovat", "Dorussaodat"], themes: ["tarix", "me'morchilik"] },
  { name: "Qarshi", region: "Qashqadaryo", aliases: ["karshi", "карши"], attractions: ["Odina majmuasi", "Qarshi ko‘prigi", "Ko‘kgumbaz masjidi"], themes: ["tarix", "shahar sayohati"] },
  { name: "Termiz", region: "Surxondaryo", aliases: ["termez", "термез"], attractions: ["Hakim at-Termiziy", "Sulton Saodat", "Fayoztepa", "Qoratepa", "Kampirtepa"], themes: ["arxeologiya", "ziyorat", "tarix"] },
  { name: "Boysun", region: "Surxondaryo", aliases: ["boysун", "байсун"], attractions: ["Boysun tog‘lari", "mahalliy folklor va hunarmandchilik"], themes: ["tabiat", "etnoturizm", "tog‘"] },
  { name: "Denov", region: "Surxondaryo", aliases: ["denau", "денов"], attractions: ["Sayid Otaliq madrasasi", "Surxondaryo tog‘ yo‘nalishlari"], themes: ["tarix", "tabiat"] },
  { name: "Zomin", region: "Jizzax", aliases: ["zaamin", "заамин", "zomin"], attractions: ["Zomin milliy bog‘i", "archa o‘rmonlari", "tog‘ sayr yo‘nalishlari"], themes: ["tabiat", "tog‘", "sanatoriy"] },
  { name: "Jizzax", region: "Jizzax", aliases: ["джизак", "jizzakh"], attractions: ["Zomin yo‘nalishi", "Aydar-Arnasoy yo‘nalishi"], themes: ["tabiat", "shahar sayohati"] },
  { name: "Aydarkul", region: "Jizzax/Navoiy", aliases: ["aydar ko‘l", "aydar lake", "айдаркуль", "aydarkul"], attractions: ["Aydarko‘l", "Yangiqazg‘on yurt lagerlari", "cho‘l safari"], themes: ["eko", "cho‘l", "ko‘l"] },
  { name: "Nurota", region: "Navoiy", aliases: ["nurata", "нурата"], attractions: ["Chashma majmuasi", "Nurota qal’asi", "Nurota tog‘lari"], themes: ["ziyorat", "tabiat", "tarix"] },
  { name: "Navoiy", region: "Navoiy", aliases: ["navoi", "навои"], attractions: ["Nurota yo‘nalishi", "Aydarko‘l yo‘nalishi"], themes: ["shahar sayohati", "eko"] },
  { name: "Chimgan", region: "Toshkent viloyati", aliases: ["chimyon", "чимган", "chimgan"], attractions: ["Chimgan tog‘lari", "piyoda yo‘laklari", "qishki dam olish"], themes: ["tog‘", "tabiat", "aktiv turizm"] },
  { name: "Amirsoy", region: "Toshkent viloyati", aliases: ["amirsoy", "амирсой"], attractions: ["tog‘ kurorti", "kanat yo‘li", "qishki sport"], themes: ["tog‘", "kurort", "aktiv turizm"] },
  { name: "Beldersoy", region: "Toshkent viloyati", aliases: ["beldersay", "бельдерсай"], attractions: ["tog‘ yo‘nalishlari", "chang‘i hududi"], themes: ["tog‘", "aktiv turizm"] },
  { name: "Chorvoq", region: "Toshkent viloyati", aliases: ["charvak", "чарвак", "chorvoq"], attractions: ["Chorvoq suv ombori", "qirg‘oq dam olish maskanlari"], themes: ["suv bo‘yi", "dam olish", "tabiat"] },
  { name: "Qo‘qon", region: "Farg‘ona", aliases: ["kokand", "коканд", "qoqon", "qo'qon"], attractions: ["Xudoyorxon saroyi", "Jome masjidi", "Norbutabiy madrasasi"], themes: ["tarix", "me'morchilik"] },
  { name: "Marg‘ilon", region: "Farg‘ona", aliases: ["margilan", "маргилан", "margilon"], attractions: ["atlas va adras hunarmandchiligi", "Yodgorlik ipak fabrikasi"], themes: ["hunarmandchilik", "shopping", "madaniyat"] },
  { name: "Rishton", region: "Farg‘ona", aliases: ["rishtan", "риштан"], attractions: ["kulolchilik ustaxonalari", "keramika markazlari"], themes: ["hunarmandchilik", "shopping"] },
  { name: "Farg‘ona", region: "Farg‘ona", aliases: ["fergana", "фергана", "fargona"], attractions: ["Farg‘ona vodiysi yo‘nalishlari", "Qo‘qon–Marg‘ilon–Rishton kombinatsiyasi"], themes: ["shahar sayohati", "madaniyat"] },
  { name: "Namangan", region: "Namangan", aliases: ["наманган"], attractions: ["Bobur bog‘i", "Mulla Qirg‘iz madrasasi", "Chortoq va Chust yo‘nalishlari"], themes: ["shahar sayohati", "ziyorat", "tabiat"] },
  { name: "Chust", region: "Namangan", aliases: ["чуст"], attractions: ["Chust pichoqlari va hunarmandchiligi", "mahalliy bozor"], themes: ["hunarmandchilik", "shopping", "gastronomiya"] },
  { name: "Chortoq", region: "Namangan", aliases: ["chartak", "чартак"], attractions: ["sanatoriy va mineral suv yo‘nalishlari"], themes: ["sanatoriy", "sog‘lomlashtirish"] },
  { name: "Andijon", region: "Andijon", aliases: ["andijan", "андижан"], attractions: ["Bobur bog‘i", "Andijon shahar sayohati"], themes: ["shahar sayohati", "tarix"] },
  { name: "Nukus", region: "Qoraqalpog‘iston", aliases: ["нукус"], attractions: ["Savitskiy muzeyi", "Qoraqalpoq madaniyati", "Moynaq yo‘nalishi"], themes: ["muzey", "madaniyat", "san'at"] },
  { name: "Moynaq", region: "Qoraqalpog‘iston", aliases: ["muynak", "мойнак", "mo‘ynoq", "moynoq"], attractions: ["Kemalar qabristoni", "Orol dengizi tarixi", "Ustyurt yo‘nalishlari"], themes: ["eko", "tarix", "ekspeditsiya"] },
  { name: "Orol dengizi", region: "Qoraqalpog‘iston", aliases: ["aral sea", "аральское море", "orol", "aral"], attractions: ["Orolbo‘yi landshaftlari", "Ustyurt platosi", "Moynaq"], themes: ["eko", "ekspeditsiya", "fototur"] },
];

function normalize(value: string) {
  return normalizeAirportSearch(value.replace(/[ʻ’`´]/g, "'").replace(/[–—→]/g, "-")).toLowerCase();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectDomesticDestinations(text: string) {
  const normalized = normalize(text);
  const found: Array<{ index: number; destination: DomesticDestination; suffix: "from" | "to" | "" }> = [];
  for (const destination of UZBEKISTAN_DESTINATIONS) {
    for (const alias of [destination.name, ...destination.aliases]) {
      const value = normalize(alias);
      if (!value) continue;
      const match = new RegExp(`(?:^|[\\s,;:-])(${escapeRegex(value)})(dan|ga|gacha|да|дан|га)?(?=$|[\\s,;:.-])`, "i").exec(normalized);
      if (!match) continue;
      const ending = (match[2] || "").toLowerCase();
      found.push({ index: match.index, destination, suffix: ending === "dan" || ending === "дан" ? "from" : ending === "ga" || ending === "gacha" || ending === "га" ? "to" : "" });
      break;
    }
  }
  return found.sort((a, b) => a.index - b.index).filter((item, index, items) => items.findIndex((other) => other.destination.name === item.destination.name) === index);
}

export function isUzbekistanDomesticTourism(text: string) {
  return detectDomesticDestinations(text).length > 0 || /o['‘’`]?zbekiston bo['‘’`]?ylab|ichki tur|ichki sayohat|uzbekistan bo['‘’`]?ylab|внутренн(?:ий|его) туризм|по узбекистану/i.test(text);
}

export function domesticTourAdvice(text: string) {
  const places = detectDomesticDestinations(text).map((item) => item.destination);
  if (!places.length) return null;
  const normalized = normalize(text);
  const attractions = Array.from(new Set(places.flatMap((place) => place.attractions))).slice(0, 6);
  const reminders: string[] = [];
  if (!/(?:\bgid\b|guide|ekskursovod|\bгид\b|экскурсовод)/i.test(normalized)) reminders.push("gid yoki ekskursovod");
  if (!/(tushlik|obed|обед|kechki ovqat|ujin|ужин|nonushta|zavtrak|завтрак|restoran|restaurant|ресторан|ovqat)/i.test(normalized)) reminders.push("tushlik/kechki ovqat va guruh uchun restoran");
  if (!/(muzey|museum|музей|chipta|bilet|билет|kirish)/i.test(normalized)) reminders.push("muzey, ziyoratgoh yoki obyektlarga kirish chiptalari");
  if (!/(transfer|taksi|taxi|avtobus|bus|transport|трансфер|такси|автобус)/i.test(normalized)) reminders.push("mahalliy transfer yoki avtobus");
  const duration = /(\d+)\s*(?:kun|day|дн)/i.exec(normalized);
  if (duration && Number(duration[1]) >= 2 && !/(mehmonxona|hotel|otel|гостиница|отель|hostel)/i.test(normalized)) reminders.push("mehmonxona");
  return { places, attractions, reminders };
}

export const UZBEKISTAN_TOURISM_AI_CONTEXT = `
Uzbekistan domestic tourism expertise rules:
- Treat domestic travel as a complete trip-design problem, not only transport. Consider route, timing, local transfer, guide, meals/restaurants, hotel, museum/attraction tickets, pilgrimage sites, group size and realistic pacing.
- Recognize key domestic destinations and combinations: Tashkent; Samarkand (Registan, Shah-i-Zinda, Gur-e-Amir, Bibi-Khanym, Ulugbek Observatory, Imam Bukhari); Bukhara (Poi Kalon, Ark, Lyabi Hauz, Samanid Mausoleum, Chor Minor, Seven Pirs); Khiva (Ichan-Qala, Kalta Minor, Kunya Ark, Tash Khauli, Juma Mosque); Shahrisabz; Termez/Surkhandarya; Zaamin; Chimgan-Amirsoy-Beldersay-Charvak; Kokand-Margilan-Rishtan; Namangan-Chust-Chartak; Nukus-Muynak-Aral Sea; Nurata-Aydarkul.
- If the user describes a domestic tour but omits useful components, proactively remind them that separate requests can be created for a guide, lunch/dinner or group restaurant, local transport, hotel for multi-day trips, and museum/attraction entrance tickets.
- Suggest a small set of relevant sights for the named destination, but do not invent live opening hours, current ticket prices, restaurant availability or road conditions. Those require fresh data.
- For groups, think operationally: vehicle capacity, meal reservation, guide language, hotel rooming, attraction tickets and route timing.
- Do not force every add-on. Present them as practical optional requests unless the user explicitly asks to include them.
`.trim();
