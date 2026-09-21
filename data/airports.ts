export type AirportReference = {
  code: string;
  icao?: string;
  city: string;
  airport?: string;
  country: string;
  aliases?: string[];
};

export const AIRPORTS: AirportReference[] = [
  { code: "TAS", icao: "UZTT", city: "Toshkent", airport: "Tashkent International Airport", country: "Uzbekistan", aliases: ["Tashkent", "Ташкент", "Toshkent Airport"] },
  { code: "NMA", icao: "UZFN", city: "Namangan", airport: "Namangan International Airport", country: "Uzbekistan", aliases: ["Namangan", "Наманган"] },
  { code: "AZN", icao: "UZFA", city: "Andijon", airport: "Andijan International Airport", country: "Uzbekistan", aliases: ["Andizhan", "Андижан", "Andijon"] },
  { code: "FEG", icao: "UZFF", city: "Farg'ona", airport: "Fergana International Airport", country: "Uzbekistan", aliases: ["Fergana", "Фергана", "Fargona"] },
  { code: "SKD", icao: "UZSS", city: "Samarqand", airport: "Samarkand International Airport", country: "Uzbekistan", aliases: ["Samarkand", "Самарканд", "Samarqand Airport"] },
  { code: "BHK", icao: "UZSB", city: "Buxoro", airport: "Bukhara International Airport", country: "Uzbekistan", aliases: ["Bukhara", "Бухара", "Buxoro Airport"] },
  { code: "UGC", icao: "UZNU", city: "Urganch", airport: "Urgench International Airport", country: "Uzbekistan", aliases: ["Urgench", "Ургенч", "Urganch Airport"] },
  { code: "NCU", icao: "UZNN", city: "Nukus", airport: "Nukus International Airport", country: "Uzbekistan", aliases: ["Nukus", "Нукус"] },
  { code: "KSQ", icao: "UZSK", city: "Qarshi", airport: "Karshi Airport", country: "Uzbekistan", aliases: ["Karshi", "Карши"] },
  { code: "TMJ", icao: "UZST", city: "Termiz", airport: "Termez Airport", country: "Uzbekistan", aliases: ["Termez", "Термез"] },
  { code: "IST", icao: "LTFM", city: "Istanbul", airport: "Istanbul Airport", country: "Türkiye", aliases: ["Стамбул", "Istanbul Airport"] },
  { code: "SAW", icao: "LTFJ", city: "Istanbul", airport: "Istanbul Sabiha Gökçen International Airport", country: "Türkiye", aliases: ["Стамбул", "Sabiha", "Sabia"] },
  { code: "AYT", icao: "LTAI", city: "Antalya", airport: "Antalya International Airport", country: "Türkiye", aliases: ["Antalya Airport"] },
  { code: "ADB", icao: "LTFK", city: "Izmir", airport: "Adnan Menderes Airport", country: "Türkiye", aliases: ["Izmir Airport"] },
  { code: "AER", icao: "URSS", city: "Sochi", airport: "Sochi International Airport", country: "Russia", aliases: ["Сочи", "Adler"] },
  { code: "DME", icao: "UUDD", city: "Moscow", airport: "Domodedovo International Airport", country: "Russia", aliases: ["Moskva", "Москва", "Domodedovo"] },
  { code: "SVO", icao: "UUEE", city: "Moscow", airport: "Sheremetyevo International Airport", country: "Russia", aliases: ["Moskva", "Москва", "Sheremetyevo"] },
  { code: "VKO", icao: "UUWW", city: "Moscow", airport: "Vnukovo International Airport", country: "Russia", aliases: ["Moskva", "Москва", "Vnukovo"] },
  { code: "LED", icao: "ULLI", city: "Saint Petersburg", airport: "Pulkovo Airport", country: "Russia", aliases: ["St. Petersburg", "Санкт-Петербург", "Pulkovo"] },
  { code: "KRR", icao: "URKK", city: "Krasnodar", airport: "Krasnodar Pashkovsky International Airport", country: "Russia", aliases: ["Краснодар", "Pashkovsky"] },
  { code: "ROV", icao: "URRP", city: "Rostov-on-Don", airport: "Platov International Airport", country: "Russia", aliases: ["Rostov", "Ростов"] },
  { code: "KJA", icao: "UNKL", city: "Krasnoyarsk", airport: "Krasnoyarsk International Airport", country: "Russia", aliases: ["Красноярск", "Yemelyanovo"] },
  { code: "SVX", icao: "USSS", city: "Yekaterinburg", airport: "Koltsovo Airport", country: "Russia", aliases: ["Ekaterinburg", "Екатеринбург"] },
  { code: "KZN", icao: "UWKD", city: "Kazan", airport: "Kazan International Airport", country: "Russia", aliases: ["Казань"] },
  { code: "MMK", icao: "ULMM", city: "Murmansk", airport: "Emperor Nicholas II Murmansk Airport", country: "Russia", aliases: ["Мурманск"] },
  { code: "FRU", icao: "UAFM", city: "Bishkek", airport: "Manas International Airport", country: "Kyrgyzstan", aliases: ["Bishkek Airport", "Манас"] },
  { code: "OSS", icao: "UCFO", city: "Osh", airport: "Osh International Airport", country: "Kyrgyzstan", aliases: ["Ош"] },
  { code: "ALA", icao: "UAAA", city: "Almaty", airport: "Almaty International Airport", country: "Kazakhstan", aliases: ["Алматы"] },
  { code: "NQZ", icao: "UACC", city: "Astana", airport: "Nursultan Nazarbayev International Airport", country: "Kazakhstan", aliases: ["Nur-Sultan", "Нур-Султан", "Astana", "TSE"] },
  { code: "KGF", icao: "UAKK", city: "Karaganda", airport: "Sary-Arka Airport", country: "Kazakhstan", aliases: ["Karaganda Airport"] },
  { code: "GUW", icao: "UATG", city: "Atyrau", airport: "Atyrau International Airport", country: "Kazakhstan", aliases: ["Атырау"] },
  { code: "CIT", icao: "UAII", city: "Shymkent", airport: "Shymkent International Airport", country: "Kazakhstan", aliases: ["Шымкент"] },
  { code: "DYU", icao: "UTDD", city: "Dushanbe", airport: "Dushanbe International Airport", country: "Tajikistan", aliases: ["Душанбе"] },
  { code: "LBD", icao: "UTDL", city: "Khujand", airport: "Khujand International Airport", country: "Tajikistan", aliases: ["Худжанд"] },
  { code: "GYD", icao: "UBBB", city: "Baku", airport: "Heydar Aliyev International Airport", country: "Azerbaijan", aliases: ["Baku Airport", "Баку"] },
  { code: "TBS", icao: "UGTB", city: "Tbilisi", airport: "Tbilisi International Airport", country: "Georgia", aliases: ["Tblisi", "Тбилиси"] },
  { code: "BUS", icao: "UGSB", city: "Batumi", airport: "Alexander Kartveli Batumi International Airport", country: "Georgia", aliases: ["Батуми"] },
  { code: "KUT", icao: "UGKO", city: "Kutaisi", airport: "David the Builder Kutaisi International Airport", country: "Georgia", aliases: ["Кутаиси"] },
  { code: "ICN", icao: "RKSI", city: "Seoul", airport: "Incheon International Airport", country: "South Korea", aliases: ["Incheon", "인천"] },
  { code: "GMP", icao: "RKSS", city: "Seoul", airport: "Seoul Gimpo International Airport", country: "South Korea", aliases: ["Gimpo", "김포"] },
  { code: "CJU", icao: "RKPC", city: "Jeju", airport: "Jeju International Airport", country: "South Korea", aliases: ["Jeju Airport"] },
  { code: "PEK", icao: "ZBAA", city: "Beijing", airport: "Beijing Capital International Airport", country: "China", aliases: ["Peking"] },
  { code: "SHA", icao: "ZSSS", city: "Shanghai", airport: "Shanghai Hongqiao International Airport", country: "China", aliases: ["Shanghai Hongqiao"] },
  { code: "PVG", icao: "ZSPD", city: "Shanghai", airport: "Shanghai Pudong International Airport", country: "China", aliases: ["Pudong"] },
  { code: "CAN", icao: "ZGGG", city: "Guangzhou", airport: "Guangzhou Baiyun International Airport", country: "China", aliases: ["Canton"] },
  { code: "HKG", icao: "VHHH", city: "Hong Kong", airport: "Hong Kong International Airport", country: "Hong Kong", aliases: ["Chek Lap Kok"] },
  { code: "HKT", icao: "VTSP", city: "Phuket", airport: "Phuket International Airport", country: "Thailand", aliases: ["Phuket Airport"] },
  { code: "BKK", icao: "VTBS", city: "Bangkok", airport: "Suvarnabhumi Airport", country: "Thailand", aliases: ["Bangkok Airport", "Suvarnabhumi"] },
  { code: "DMK", icao: "VTBD", city: "Bangkok", airport: "Don Mueang International Airport", country: "Thailand", aliases: ["Don Mueang"] },
  { code: "KUL", icao: "WMKK", city: "Kuala Lumpur", airport: "Kuala Lumpur International Airport", country: "Malaysia", aliases: ["KLIA"] },
  { code: "SIN", icao: "WSSS", city: "Singapore", airport: "Changi Airport", country: "Singapore", aliases: ["Singapore Changi"] },
  { code: "DXB", icao: "OMDB", city: "Dubai", airport: "Dubai International Airport", country: "United Arab Emirates", aliases: ["Dubay", "Дубай"] },
  { code: "AUH", icao: "OMAA", city: "Abu Dhabi", airport: "Zayed International Airport", country: "United Arab Emirates", aliases: ["Abu Dhabi Airport"] },
  { code: "SHJ", icao: "OMSJ", city: "Sharjah", airport: "Sharjah International Airport", country: "United Arab Emirates", aliases: ["Sharja", "Шарджа"] },
  { code: "DWC", icao: "OMDW", city: "Dubai", airport: "Al Maktoum International Airport", country: "United Arab Emirates", aliases: ["Dubai World Central", "Jebel Ali"] },
  { code: "JED", icao: "OEJN", city: "Jeddah", airport: "King Abdulaziz International Airport", country: "Saudi Arabia", aliases: ["Jidda", "Jedda", "جدة"] },
  { code: "MED", icao: "OEMA", city: "Madinah", airport: "Prince Mohammad Bin Abdulaziz Airport", country: "Saudi Arabia", aliases: ["Madina", "Medina", "المدينة"] },
  { code: "RUH", icao: "OERK", city: "Riyadh", airport: "King Khalid International Airport", country: "Saudi Arabia", aliases: ["Ar-Riyad", "Эр-Рияд"] },
  { code: "DOH", icao: "OTHH", city: "Doha", airport: "Hamad International Airport", country: "Qatar", aliases: ["Doha Airport"] },
  { code: "CAI", icao: "HECA", city: "Cairo", airport: "Cairo International Airport", country: "Egypt", aliases: ["Qohira", "Каир"] },
  { code: "SSH", icao: "HESH", city: "Sharm El Sheikh", airport: "Sharm El Sheikh International Airport", country: "Egypt", aliases: ["Sharm ash-Shaykh", "Шарм-эль-Шейх"] },
  { code: "HRG", icao: "HEGN", city: "Hurghada", airport: "Hurghada International Airport", country: "Egypt", aliases: ["Hurghada Airport"] },
  { code: "LXR", icao: "HELX", city: "Luxor", airport: "Luxor International Airport", country: "Egypt", aliases: ["Luxor Airport"] },
  { code: "CXR", icao: "VVCR", city: "Nha Trang", airport: "Cam Ranh International Airport", country: "Vietnam", aliases: ["Cam Ranh"] },
  { code: "MNL", icao: "RPLL", city: "Manila", airport: "Ninoy Aquino International Airport", country: "Philippines", aliases: ["NAIA"] },
  { code: "BOM", icao: "VABB", city: "Mumbai", airport: "Chhatrapati Shivaji Maharaj International Airport", country: "India", aliases: ["Bombay"] },
  { code: "DEL", icao: "VIDP", city: "Delhi", airport: "Indira Gandhi International Airport", country: "India", aliases: ["New Delhi"] },
  { code: "LHR", icao: "EGLL", city: "London", airport: "London Heathrow Airport", country: "United Kingdom", aliases: ["London Heathrow"] },
  { code: "CDG", icao: "LFPG", city: "Paris", airport: "Charles de Gaulle International Airport", country: "France", aliases: ["Paris CDG"] },
  { code: "FRA", icao: "EDDF", city: "Frankfurt", airport: "Frankfurt Main Airport", country: "Germany", aliases: ["Frankfurt Main"] },
  { code: "BER", icao: "EDDB", city: "Berlin", airport: "Berlin Brandenburg Airport", country: "Germany", aliases: ["Berlin Airport", "BER"] },
  { code: "MUC", icao: "EDDM", city: "Munich", airport: "Munich Airport", country: "Germany", aliases: ["München"] },
  { code: "DUS", icao: "EDDL", city: "Düsseldorf", airport: "Düsseldorf Airport", country: "Germany", aliases: ["Dusseldorf"] },
  { code: "AMS", icao: "EHAM", city: "Amsterdam", airport: "Amsterdam Airport Schiphol", country: "Netherlands", aliases: ["Schiphol"] },
  { code: "MAD", icao: "LEMD", city: "Madrid", airport: "Adolfo Suárez Madrid–Barajas Airport", country: "Spain", aliases: ["Madrid Barajas"] },
  { code: "BCN", icao: "LEBL", city: "Barcelona", airport: "Josep Tarradellas Barcelona-El Prat Airport", country: "Spain", aliases: ["Barcelona Airport"] },
  { code: "PRG", icao: "LKPR", city: "Prague", airport: "Václav Havel Airport Prague", country: "Czech Republic", aliases: ["Prague Airport"] },
  { code: "WAW", icao: "EPWA", city: "Warsaw", airport: "Warsaw Chopin Airport", country: "Poland", aliases: ["Warsaw Airport"] },
  { code: "ARN", icao: "ESSA", city: "Stockholm", airport: "Stockholm-Arlanda Airport", country: "Sweden", aliases: ["Stockholm Arlanda"] },
  { code: "CPH", icao: "EKCH", city: "Copenhagen", airport: "Copenhagen Kastrup Airport", country: "Denmark", aliases: ["Kastrup"] },
  { code: "HEL", icao: "EFHK", city: "Helsinki", airport: "Helsinki Vantaa Airport", country: "Finland", aliases: ["Vantaa"] },
  { code: "JFK", icao: "KJFK", city: "New York", airport: "John F. Kennedy International Airport", country: "United States", aliases: ["JFK Airport"] },
  { code: "LAX", icao: "KLAX", city: "Los Angeles", airport: "Los Angeles International Airport", country: "United States", aliases: ["LAX Airport"] },
  { code: "MIA", icao: "KMIA", city: "Miami", airport: "Miami International Airport", country: "United States", aliases: ["MIA Airport"] },
  { code: "YYZ", icao: "CYYZ", city: "Toronto", airport: "Toronto Pearson International Airport", country: "Canada", aliases: ["Pearson"] },
  { code: "MLE", icao: "VRMM", city: "Malé", airport: "Velana International Airport", country: "Maldives", aliases: ["Male", "Мальдивы"] },
  { code: "CMB", icao: "VCBI", city: "Colombo", airport: "Bandaranaike International Colombo Airport", country: "Sri Lanka", aliases: ["Katunayake"] },
  { code: "MCT", icao: "OOMS", city: "Muscat", airport: "Muscat International Airport", country: "Oman", aliases: ["Muscat Airport"] },
  { code: "KWI", icao: "OKKK", city: "Kuwait City", airport: "Kuwait International Airport", country: "Kuwait", aliases: ["Kuwait Airport"] },
  { code: "BAH", icao: "OBBI", city: "Manama", airport: "Bahrain International Airport", country: "Bahrain", aliases: ["Bahrain Airport"] },
  { code: "HND", icao: "RJTT", city: "Tokyo", airport: "Tokyo Haneda International Airport", country: "Japan", aliases: ["Haneda"] },
  { code: "NRT", icao: "RJAA", city: "Tokyo", airport: "Narita International Airport", country: "Japan", aliases: ["Narita"] }
];

export function validateAirports(items: AirportReference[] = AIRPORTS) {
  const seen = new Set<string>();

  for (const airport of items) {
    if (!airport || !airport.code || !/^[A-Z]{3}$/.test(airport.code)) {
      throw new Error(`Invalid airport code: ${airport?.code ?? "unknown"}`);
    }
    if (!airport.city || !airport.country) {
      throw new Error(`Airport missing city/country: ${airport.code}`);
    }
    if (seen.has(airport.code)) {
      throw new Error(`Duplicate airport code: ${airport.code}`);
    }
    seen.add(airport.code);
  }

  return true;
}

if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
  validateAirports(AIRPORTS);
}

export default AIRPORTS;
