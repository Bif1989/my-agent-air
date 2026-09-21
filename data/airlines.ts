export type AirlineReference = {
  code: string;
  icao?: string;
  name: string;
  country: string;
  aliases?: string[];
};

export const AIRLINES: AirlineReference[] = [
  { code: "HY", icao: "UZB", name: "Uzbekistan Airways", country: "Uzbekistan", aliases: ["UzAirways", "O‘zbekiston Havo Yo‘llari", "Узбекистон Хаво Йуллари"] },
  { code: "HH", icao: "QNT", name: "Qanot Sharq", country: "Uzbekistan", aliases: ["Qanotsharq", "Канот Шарк"] },
  { code: "C6", name: "Centrum Air", country: "Uzbekistan", aliases: ["Centrum", "Центрум Эйр"] },
  { code: "9S", icao: "UZS", name: "Air Samarkand", country: "Uzbekistan", aliases: ["Самарканд Эйр"] },
  { code: "US", icao: "USF", name: "Silk Avia", country: "Uzbekistan", aliases: ["Silkavia", "Силк Авиа"] },
  { code: "2U", icao: "FHY", name: "Fly Khiva", country: "Uzbekistan", aliases: ["FlyKhiva", "Флай Хива"] },
  { code: "TK", icao: "THY", name: "Turkish Airlines", country: "Türkiye", aliases: ["Turkish", "Турецкие авиалинии"] },
  { code: "PC", icao: "PGT", name: "Pegasus Airlines", country: "Türkiye", aliases: ["Pegasus", "Пегасус"] },
  { code: "VF", icao: "TKJ", name: "AJet", country: "Türkiye", aliases: ["AnadoluJet", "Аджет"] },
  { code: "FZ", icao: "FDB", name: "flydubai", country: "United Arab Emirates", aliases: ["Fly Dubai", "Флайдубай"] },
  { code: "EK", icao: "UAE", name: "Emirates", country: "United Arab Emirates", aliases: ["Эмирейтс"] },
  { code: "EY", icao: "ETD", name: "Etihad Airways", country: "United Arab Emirates", aliases: ["Etihad", "Этихад"] },
  { code: "G9", icao: "ABY", name: "Air Arabia", country: "United Arab Emirates", aliases: ["Эйр Арабия"] },
  { code: "QR", icao: "QTR", name: "Qatar Airways", country: "Qatar", aliases: ["Катарские авиалинии"] },
  { code: "SV", icao: "SVA", name: "Saudia", country: "Saudi Arabia", aliases: ["Saudi Arabian Airlines", "Саудия"] },
  { code: "XY", icao: "KNE", name: "flynas", country: "Saudi Arabia", aliases: ["Flynas", "Флайнас"] },
  { code: "J9", icao: "JZR", name: "Jazeera Airways", country: "Kuwait", aliases: ["Jazeera", "Джазира"] },
  { code: "KU", icao: "KAC", name: "Kuwait Airways", country: "Kuwait", aliases: ["Кувейтские авиалинии"] },
  { code: "GF", icao: "GFA", name: "Gulf Air", country: "Bahrain", aliases: ["Галф Эйр"] },
  { code: "WY", icao: "OMA", name: "Oman Air", country: "Oman", aliases: ["Оман Эйр"] },
  { code: "KC", icao: "KZR", name: "Air Astana", country: "Kazakhstan", aliases: ["Эйр Астана"] },
  { code: "DV", icao: "VSV", name: "SCAT Airlines", country: "Kazakhstan", aliases: ["SCAT", "Скат"] },
  { code: "SU", icao: "AFL", name: "Aeroflot", country: "Russia", aliases: ["Аэрофлот"] },
  { code: "S7", icao: "SBI", name: "S7 Airlines", country: "Russia", aliases: ["Sibir", "Сибирь"] },
  { code: "DP", icao: "PBD", name: "Pobeda", country: "Russia", aliases: ["Победа"] },
  { code: "U6", icao: "SVR", name: "Ural Airlines", country: "Russia", aliases: ["Уральские авиалинии"] },
  { code: "UT", icao: "UTA", name: "UTair", country: "Russia", aliases: ["Ютэйр"] },
  { code: "A4", icao: "AZO", name: "Azimuth Airlines", country: "Russia", aliases: ["Azimuth", "Азимут"] },
  { code: "J2", icao: "AHY", name: "Azerbaijan Airlines", country: "Azerbaijan", aliases: ["AZAL", "Азербайджанские авиалинии"] },
  { code: "A9", icao: "TGZ", name: "Georgian Airways", country: "Georgia", aliases: ["Грузинские авиалинии"] },
  { code: "B2", icao: "BRU", name: "Belavia", country: "Belarus", aliases: ["Белавиа"] },
  { code: "LH", icao: "DLH", name: "Lufthansa", country: "Germany", aliases: ["Люфтганза"] },
  { code: "LO", icao: "LOT", name: "LOT Polish Airlines", country: "Poland", aliases: ["LOT", "Польские авиалинии"] },
  { code: "AF", icao: "AFR", name: "Air France", country: "France", aliases: ["Эйр Франс"] },
  { code: "KL", icao: "KLM", name: "KLM", country: "Netherlands", aliases: ["KLM Royal Dutch Airlines", "КЛМ"] },
  { code: "BA", icao: "BAW", name: "British Airways", country: "United Kingdom", aliases: ["Бритиш Эйрвейз"] },
  { code: "LX", icao: "SWR", name: "SWISS", country: "Switzerland", aliases: ["Swiss International Air Lines", "Свисс"] },
  { code: "OS", icao: "AUA", name: "Austrian Airlines", country: "Austria", aliases: ["Австрийские авиалинии"] },
  { code: "AZ", icao: "ITY", name: "ITA Airways", country: "Italy", aliases: ["Alitalia", "Ита Эйрвейз"] },
  { code: "IB", icao: "IBE", name: "Iberia", country: "Spain", aliases: ["Иберия"] },
  { code: "AY", icao: "FIN", name: "Finnair", country: "Finland", aliases: ["Финнэйр"] },
  { code: "SK", icao: "SAS", name: "SAS", country: "Denmark", aliases: ["Scandinavian Airlines", "САС"] },
  { code: "SQ", icao: "SIA", name: "Singapore Airlines", country: "Singapore", aliases: ["Сингапурские авиалинии"] },
  { code: "TG", icao: "THA", name: "Thai Airways", country: "Thailand", aliases: ["Тайские авиалинии"] },
  { code: "MH", icao: "MAS", name: "Malaysia Airlines", country: "Malaysia", aliases: ["Малайзия Эйрлайнс"] },
  { code: "AK", icao: "AXM", name: "AirAsia", country: "Malaysia", aliases: ["Air Asia", "ЭйрАзия"] },
  { code: "TR", icao: "TGW", name: "Scoot", country: "Singapore", aliases: ["Скут"] },
  { code: "KE", icao: "KAL", name: "Korean Air", country: "South Korea", aliases: ["Корейские авиалинии"] },
  { code: "OZ", icao: "AAR", name: "Asiana Airlines", country: "South Korea", aliases: ["Азиана"] },
  { code: "CA", icao: "CCA", name: "Air China", country: "China", aliases: ["Эйр Чайна"] },
  { code: "CZ", icao: "CSN", name: "China Southern", country: "China", aliases: ["China Southern Airlines", "Китайские Южные авиалинии"] },
  { code: "MU", icao: "CES", name: "China Eastern", country: "China", aliases: ["China Eastern Airlines", "Китайские Восточные авиалинии"] },
  { code: "HU", icao: "CHH", name: "Hainan Airlines", country: "China", aliases: ["Хайнаньские авиалинии"] },
  { code: "CX", icao: "CPA", name: "Cathay Pacific", country: "Hong Kong", aliases: ["Катей Пасифик"] },
  { code: "NH", icao: "ANA", name: "ANA", country: "Japan", aliases: ["All Nippon Airways", "Олл Ниппон"] },
  { code: "JL", icao: "JAL", name: "Japan Airlines", country: "Japan", aliases: ["JAL", "Японские авиалинии"] },
  { code: "AI", icao: "AIC", name: "Air India", country: "India", aliases: ["Эйр Индия"] },
  { code: "6E", icao: "IGO", name: "IndiGo", country: "India", aliases: ["Indigo", "Индиго"] },
  { code: "UL", icao: "ALK", name: "SriLankan Airlines", country: "Sri Lanka", aliases: ["Sri Lankan", "ШриЛанкан"] },
];

export function validateAirlines(items: AirlineReference[] = AIRLINES) {
  const seen = new Set<string>();

  for (const airline of items) {
    if (!airline || !/^[A-Z0-9]{2}$/.test(airline.code)) {
      throw new Error(`Invalid airline code: ${airline?.code ?? "unknown"}`);
    }
    if (!airline.name || !airline.country) {
      throw new Error(`Airline missing name/country: ${airline.code}`);
    }
    if (airline.icao && !/^[A-Z]{3}$/.test(airline.icao)) {
      throw new Error(`Invalid airline ICAO: ${airline.code}`);
    }
    if (seen.has(airline.code)) {
      throw new Error(`Duplicate airline code: ${airline.code}`);
    }
    seen.add(airline.code);
  }

  return true;
}

export function getAirlineByCode(code: string | null | undefined) {
  const normalizedCode = code?.trim().toUpperCase();
  return normalizedCode ? AIRLINES.find((airline) => airline.code === normalizedCode) : undefined;
}

export function formatAirline(code: string | null | undefined) {
  const value = code?.trim();
  if (!value) return "Ko‘rsatilmagan";
  const airline = getAirlineByCode(value);
  return airline ? `${airline.code} — ${airline.name}` : value;
}

if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
  validateAirlines(AIRLINES);
}

export default AIRLINES;
