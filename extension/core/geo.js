// Best-effort IANA time zone from a free-text location ("San Francisco, CA, US", "Berlin, Germany").
// Cities win over regions, regions over countries. Multi-zone countries fall back to their business capital.
// Returns null when nothing matches; the caller must treat a result as approximate.

const strip = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s,.'-]/g, ' ').replace(/\s+/g, ' ').trim();

const CITIES = {
  // North America
  'new york': 'America/New_York', 'nyc': 'America/New_York', 'brooklyn': 'America/New_York', 'boston': 'America/New_York', 'washington': 'America/New_York', 'philadelphia': 'America/New_York',
  'miami': 'America/New_York', 'atlanta': 'America/New_York', 'detroit': 'America/New_York', 'charlotte': 'America/New_York', 'pittsburgh': 'America/New_York', 'baltimore': 'America/New_York', 'orlando': 'America/New_York', 'tampa': 'America/New_York', 'raleigh': 'America/New_York',
  'chicago': 'America/Chicago', 'austin': 'America/Chicago', 'dallas': 'America/Chicago', 'houston': 'America/Chicago', 'san antonio': 'America/Chicago', 'minneapolis': 'America/Chicago', 'st. louis': 'America/Chicago', 'st louis': 'America/Chicago', 'nashville': 'America/Chicago', 'kansas city': 'America/Chicago', 'new orleans': 'America/Chicago', 'milwaukee': 'America/Chicago', 'oklahoma city': 'America/Chicago',
  'denver': 'America/Denver', 'boulder': 'America/Denver', 'salt lake city': 'America/Denver', 'albuquerque': 'America/Denver', 'phoenix': 'America/Phoenix', 'scottsdale': 'America/Phoenix', 'tucson': 'America/Phoenix',
  'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', 'san jose': 'America/Los_Angeles', 'palo alto': 'America/Los_Angeles', 'mountain view': 'America/Los_Angeles', 'oakland': 'America/Los_Angeles', 'san diego': 'America/Los_Angeles', 'seattle': 'America/Los_Angeles', 'bellevue': 'America/Los_Angeles', 'redmond': 'America/Los_Angeles', 'portland': 'America/Los_Angeles', 'las vegas': 'America/Los_Angeles', 'sacramento': 'America/Los_Angeles', 'irvine': 'America/Los_Angeles', 'santa monica': 'America/Los_Angeles', 'silicon valley': 'America/Los_Angeles', 'bay area': 'America/Los_Angeles',
  'honolulu': 'Pacific/Honolulu', 'anchorage': 'America/Anchorage',
  'toronto': 'America/Toronto', 'montreal': 'America/Toronto', 'ottawa': 'America/Toronto', 'quebec': 'America/Toronto', 'vancouver': 'America/Vancouver', 'calgary': 'America/Edmonton', 'edmonton': 'America/Edmonton', 'winnipeg': 'America/Winnipeg', 'halifax': 'America/Halifax',
  'mexico city': 'America/Mexico_City', 'guadalajara': 'America/Mexico_City', 'monterrey': 'America/Monterrey', 'tijuana': 'America/Tijuana', 'cancun': 'America/Cancun',
  // South America
  'sao paulo': 'America/Sao_Paulo', 'rio de janeiro': 'America/Sao_Paulo', 'brasilia': 'America/Sao_Paulo', 'manaus': 'America/Manaus', 'buenos aires': 'America/Argentina/Buenos_Aires', 'santiago': 'America/Santiago', 'bogota': 'America/Bogota', 'medellin': 'America/Bogota', 'lima': 'America/Lima', 'quito': 'America/Guayaquil', 'caracas': 'America/Caracas', 'montevideo': 'America/Montevideo',
  // Europe
  'london': 'Europe/London', 'manchester': 'Europe/London', 'edinburgh': 'Europe/London', 'birmingham': 'Europe/London', 'cambridge': 'Europe/London', 'oxford': 'Europe/London', 'bristol': 'Europe/London', 'dublin': 'Europe/Dublin', 'lisbon': 'Europe/Lisbon', 'porto': 'Europe/Lisbon',
  'paris': 'Europe/Paris', 'lyon': 'Europe/Paris', 'marseille': 'Europe/Paris', 'berlin': 'Europe/Berlin', 'munich': 'Europe/Berlin', 'munchen': 'Europe/Berlin', 'hamburg': 'Europe/Berlin', 'frankfurt': 'Europe/Berlin', 'cologne': 'Europe/Berlin', 'koln': 'Europe/Berlin', 'stuttgart': 'Europe/Berlin', 'dusseldorf': 'Europe/Berlin',
  'madrid': 'Europe/Madrid', 'barcelona': 'Europe/Madrid', 'valencia': 'Europe/Madrid', 'rome': 'Europe/Rome', 'milan': 'Europe/Rome', 'milano': 'Europe/Rome', 'turin': 'Europe/Rome', 'amsterdam': 'Europe/Amsterdam', 'rotterdam': 'Europe/Amsterdam', 'utrecht': 'Europe/Amsterdam', 'eindhoven': 'Europe/Amsterdam', 'brussels': 'Europe/Brussels', 'antwerp': 'Europe/Brussels', 'luxembourg': 'Europe/Luxembourg',
  'zurich': 'Europe/Zurich', 'geneva': 'Europe/Zurich', 'basel': 'Europe/Zurich', 'vienna': 'Europe/Vienna', 'wien': 'Europe/Vienna', 'prague': 'Europe/Prague', 'warsaw': 'Europe/Warsaw', 'krakow': 'Europe/Warsaw', 'budapest': 'Europe/Budapest', 'bucharest': 'Europe/Bucharest', 'sofia': 'Europe/Sofia', 'athens': 'Europe/Athens',
  'stockholm': 'Europe/Stockholm', 'gothenburg': 'Europe/Stockholm', 'oslo': 'Europe/Oslo', 'copenhagen': 'Europe/Copenhagen', 'helsinki': 'Europe/Helsinki', 'tallinn': 'Europe/Tallinn', 'riga': 'Europe/Riga', 'vilnius': 'Europe/Vilnius', 'kyiv': 'Europe/Kyiv', 'kiev': 'Europe/Kyiv',
  'istanbul': 'Europe/Istanbul', 'ankara': 'Europe/Istanbul', 'moscow': 'Europe/Moscow', 'saint petersburg': 'Europe/Moscow', 'st. petersburg': 'Europe/Moscow', 'yekaterinburg': 'Asia/Yekaterinburg', 'novosibirsk': 'Asia/Novosibirsk', 'vladivostok': 'Asia/Vladivostok',
  // Middle East & Africa
  'dubai': 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai', 'riyadh': 'Asia/Riyadh', 'jeddah': 'Asia/Riyadh', 'doha': 'Asia/Qatar', 'tel aviv': 'Asia/Jerusalem', 'jerusalem': 'Asia/Jerusalem', 'amman': 'Asia/Amman', 'beirut': 'Asia/Beirut', 'tehran': 'Asia/Tehran',
  'cairo': 'Africa/Cairo', 'lagos': 'Africa/Lagos', 'abuja': 'Africa/Lagos', 'nairobi': 'Africa/Nairobi', 'johannesburg': 'Africa/Johannesburg', 'cape town': 'Africa/Johannesburg', 'casablanca': 'Africa/Casablanca', 'accra': 'Africa/Accra', 'addis ababa': 'Africa/Addis_Ababa',
  // Asia-Pacific
  'mumbai': 'Asia/Kolkata', 'bangalore': 'Asia/Kolkata', 'bengaluru': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', 'gurgaon': 'Asia/Kolkata', 'gurugram': 'Asia/Kolkata', 'noida': 'Asia/Kolkata', 'hyderabad': 'Asia/Kolkata', 'chennai': 'Asia/Kolkata', 'pune': 'Asia/Kolkata', 'kolkata': 'Asia/Kolkata', 'ahmedabad': 'Asia/Kolkata',
  'karachi': 'Asia/Karachi', 'lahore': 'Asia/Karachi', 'dhaka': 'Asia/Dhaka', 'colombo': 'Asia/Colombo', 'kathmandu': 'Asia/Kathmandu',
  'singapore': 'Asia/Singapore', 'kuala lumpur': 'Asia/Kuala_Lumpur', 'jakarta': 'Asia/Jakarta', 'bali': 'Asia/Makassar', 'bangkok': 'Asia/Bangkok', 'ho chi minh city': 'Asia/Ho_Chi_Minh', 'saigon': 'Asia/Ho_Chi_Minh', 'hanoi': 'Asia/Ho_Chi_Minh', 'manila': 'Asia/Manila', 'cebu': 'Asia/Manila', 'phnom penh': 'Asia/Phnom_Penh',
  'hong kong': 'Asia/Hong_Kong', 'macau': 'Asia/Macau', 'shenzhen': 'Asia/Shanghai', 'shanghai': 'Asia/Shanghai', 'beijing': 'Asia/Shanghai', 'guangzhou': 'Asia/Shanghai', 'hangzhou': 'Asia/Shanghai', 'chengdu': 'Asia/Shanghai', 'nanjing': 'Asia/Shanghai', 'wuhan': 'Asia/Shanghai', 'suzhou': 'Asia/Shanghai', 'xiamen': 'Asia/Shanghai', 'taipei': 'Asia/Taipei', 'hsinchu': 'Asia/Taipei',
  'seoul': 'Asia/Seoul', 'busan': 'Asia/Seoul', 'tokyo': 'Asia/Tokyo', 'osaka': 'Asia/Tokyo', 'kyoto': 'Asia/Tokyo', 'yokohama': 'Asia/Tokyo', 'nagoya': 'Asia/Tokyo', 'fukuoka': 'Asia/Tokyo',
  'sydney': 'Australia/Sydney', 'melbourne': 'Australia/Melbourne', 'canberra': 'Australia/Sydney', 'brisbane': 'Australia/Brisbane', 'gold coast': 'Australia/Brisbane', 'perth': 'Australia/Perth', 'adelaide': 'Australia/Adelaide', 'hobart': 'Australia/Hobart', 'darwin': 'Australia/Darwin',
  'auckland': 'Pacific/Auckland', 'wellington': 'Pacific/Auckland', 'christchurch': 'Pacific/Auckland',
};

// US states and Canadian / Australian regions (full names; two-letter codes handled below).
const US_STATES = {
  'connecticut': 'America/New_York', 'delaware': 'America/New_York', 'florida': 'America/New_York', 'georgia': 'America/New_York', 'indiana': 'America/Indiana/Indianapolis', 'kentucky': 'America/New_York', 'maine': 'America/New_York', 'maryland': 'America/New_York', 'massachusetts': 'America/New_York', 'michigan': 'America/Detroit', 'new hampshire': 'America/New_York', 'new jersey': 'America/New_York', 'new york': 'America/New_York', 'north carolina': 'America/New_York', 'ohio': 'America/New_York', 'pennsylvania': 'America/New_York', 'rhode island': 'America/New_York', 'south carolina': 'America/New_York', 'vermont': 'America/New_York', 'virginia': 'America/New_York', 'west virginia': 'America/New_York', 'district of columbia': 'America/New_York',
  'alabama': 'America/Chicago', 'arkansas': 'America/Chicago', 'illinois': 'America/Chicago', 'iowa': 'America/Chicago', 'kansas': 'America/Chicago', 'louisiana': 'America/Chicago', 'minnesota': 'America/Chicago', 'mississippi': 'America/Chicago', 'missouri': 'America/Chicago', 'nebraska': 'America/Chicago', 'north dakota': 'America/Chicago', 'oklahoma': 'America/Chicago', 'south dakota': 'America/Chicago', 'tennessee': 'America/Chicago', 'texas': 'America/Chicago', 'wisconsin': 'America/Chicago',
  'arizona': 'America/Phoenix', 'colorado': 'America/Denver', 'idaho': 'America/Boise', 'montana': 'America/Denver', 'new mexico': 'America/Denver', 'utah': 'America/Denver', 'wyoming': 'America/Denver',
  'california': 'America/Los_Angeles', 'nevada': 'America/Los_Angeles', 'oregon': 'America/Los_Angeles', 'washington state': 'America/Los_Angeles', 'alaska': 'America/Anchorage', 'hawaii': 'Pacific/Honolulu',
};
const US_CODES = {
  CT: 'America/New_York', DE: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York', IN: 'America/Indiana/Indianapolis', KY: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', NH: 'America/New_York', NJ: 'America/New_York', NY: 'America/New_York', NC: 'America/New_York', OH: 'America/New_York', PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York', VT: 'America/New_York', VA: 'America/New_York', WV: 'America/New_York', DC: 'America/New_York',
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago', IA: 'America/Chicago', KS: 'America/Chicago', LA: 'America/Chicago', MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago', NE: 'America/Chicago', ND: 'America/Chicago', OK: 'America/Chicago', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', WI: 'America/Chicago',
  AZ: 'America/Phoenix', CO: 'America/Denver', ID: 'America/Boise', MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver', WY: 'America/Denver',
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles', WA: 'America/Los_Angeles', AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
};
const REGIONS = {
  ...US_STATES,
  'ontario': 'America/Toronto', 'quebec': 'America/Toronto', 'british columbia': 'America/Vancouver', 'alberta': 'America/Edmonton', 'manitoba': 'America/Winnipeg', 'saskatchewan': 'America/Regina', 'nova scotia': 'America/Halifax',
  'new south wales': 'Australia/Sydney', 'victoria': 'Australia/Melbourne', 'queensland': 'Australia/Brisbane', 'western australia': 'Australia/Perth', 'south australia': 'Australia/Adelaide', 'tasmania': 'Australia/Hobart',
  'bavaria': 'Europe/Berlin', 'bayern': 'Europe/Berlin', 'catalonia': 'Europe/Madrid', 'lombardy': 'Europe/Rome', 'ile-de-france': 'Europe/Paris', 'england': 'Europe/London', 'scotland': 'Europe/London', 'wales': 'Europe/London',
  'karnataka': 'Asia/Kolkata', 'maharashtra': 'Asia/Kolkata', 'guangdong': 'Asia/Shanghai', 'zhejiang': 'Asia/Shanghai', 'jiangsu': 'Asia/Shanghai',
};

const COUNTRIES = {
  'united states': 'America/New_York', 'united states of america': 'America/New_York', 'usa': 'America/New_York', 'u.s.': 'America/New_York', 'u.s.a.': 'America/New_York',
  'canada': 'America/Toronto', 'mexico': 'America/Mexico_City', 'brazil': 'America/Sao_Paulo', 'brasil': 'America/Sao_Paulo', 'argentina': 'America/Argentina/Buenos_Aires', 'chile': 'America/Santiago', 'colombia': 'America/Bogota', 'peru': 'America/Lima', 'uruguay': 'America/Montevideo', 'ecuador': 'America/Guayaquil', 'venezuela': 'America/Caracas', 'costa rica': 'America/Costa_Rica', 'panama': 'America/Panama', 'guatemala': 'America/Guatemala', 'dominican republic': 'America/Santo_Domingo', 'puerto rico': 'America/Puerto_Rico',
  'united kingdom': 'Europe/London', 'uk': 'Europe/London', 'great britain': 'Europe/London', 'ireland': 'Europe/Dublin', 'portugal': 'Europe/Lisbon', 'spain': 'Europe/Madrid', 'espana': 'Europe/Madrid', 'france': 'Europe/Paris', 'germany': 'Europe/Berlin', 'deutschland': 'Europe/Berlin', 'netherlands': 'Europe/Amsterdam', 'the netherlands': 'Europe/Amsterdam', 'holland': 'Europe/Amsterdam', 'belgium': 'Europe/Brussels', 'luxembourg': 'Europe/Luxembourg', 'switzerland': 'Europe/Zurich', 'schweiz': 'Europe/Zurich', 'austria': 'Europe/Vienna', 'osterreich': 'Europe/Vienna', 'italy': 'Europe/Rome', 'italia': 'Europe/Rome',
  'denmark': 'Europe/Copenhagen', 'sweden': 'Europe/Stockholm', 'norway': 'Europe/Oslo', 'finland': 'Europe/Helsinki', 'iceland': 'Atlantic/Reykjavik', 'estonia': 'Europe/Tallinn', 'latvia': 'Europe/Riga', 'lithuania': 'Europe/Vilnius', 'poland': 'Europe/Warsaw', 'czech republic': 'Europe/Prague', 'czechia': 'Europe/Prague', 'slovakia': 'Europe/Bratislava', 'hungary': 'Europe/Budapest', 'romania': 'Europe/Bucharest', 'bulgaria': 'Europe/Sofia', 'greece': 'Europe/Athens', 'croatia': 'Europe/Zagreb', 'slovenia': 'Europe/Ljubljana', 'serbia': 'Europe/Belgrade', 'ukraine': 'Europe/Kyiv', 'belarus': 'Europe/Minsk', 'moldova': 'Europe/Chisinau', 'cyprus': 'Asia/Nicosia', 'malta': 'Europe/Malta', 'turkey': 'Europe/Istanbul', 'turkiye': 'Europe/Istanbul', 'russia': 'Europe/Moscow', 'russian federation': 'Europe/Moscow',
  'united arab emirates': 'Asia/Dubai', 'uae': 'Asia/Dubai', 'saudi arabia': 'Asia/Riyadh', 'qatar': 'Asia/Qatar', 'kuwait': 'Asia/Kuwait', 'bahrain': 'Asia/Bahrain', 'oman': 'Asia/Muscat', 'israel': 'Asia/Jerusalem', 'jordan': 'Asia/Amman', 'lebanon': 'Asia/Beirut', 'iran': 'Asia/Tehran', 'iraq': 'Asia/Baghdad',
  'egypt': 'Africa/Cairo', 'morocco': 'Africa/Casablanca', 'tunisia': 'Africa/Tunis', 'algeria': 'Africa/Algiers', 'nigeria': 'Africa/Lagos', 'ghana': 'Africa/Accra', 'kenya': 'Africa/Nairobi', 'ethiopia': 'Africa/Addis_Ababa', 'tanzania': 'Africa/Dar_es_Salaam', 'uganda': 'Africa/Kampala', 'rwanda': 'Africa/Kigali', 'south africa': 'Africa/Johannesburg', 'senegal': 'Africa/Dakar', 'ivory coast': 'Africa/Abidjan', "cote d'ivoire": 'Africa/Abidjan',
  'india': 'Asia/Kolkata', 'pakistan': 'Asia/Karachi', 'bangladesh': 'Asia/Dhaka', 'sri lanka': 'Asia/Colombo', 'nepal': 'Asia/Kathmandu', 'kazakhstan': 'Asia/Almaty', 'uzbekistan': 'Asia/Tashkent',
  'china': 'Asia/Shanghai', "people's republic of china": 'Asia/Shanghai', 'prc': 'Asia/Shanghai', 'hong kong sar': 'Asia/Hong_Kong', 'taiwan': 'Asia/Taipei', 'japan': 'Asia/Tokyo', 'south korea': 'Asia/Seoul', 'korea': 'Asia/Seoul', 'republic of korea': 'Asia/Seoul', 'mongolia': 'Asia/Ulaanbaatar',
  'singapore': 'Asia/Singapore', 'malaysia': 'Asia/Kuala_Lumpur', 'indonesia': 'Asia/Jakarta', 'thailand': 'Asia/Bangkok', 'vietnam': 'Asia/Ho_Chi_Minh', 'viet nam': 'Asia/Ho_Chi_Minh', 'philippines': 'Asia/Manila', 'cambodia': 'Asia/Phnom_Penh', 'myanmar': 'Asia/Yangon', 'laos': 'Asia/Vientiane',
  'australia': 'Australia/Sydney', 'new zealand': 'Pacific/Auckland', 'fiji': 'Pacific/Fiji',
};
// ISO 3166-1 alpha-2, only when the token is upper case in the source string.
const ISO = {
  US: 'America/New_York', CA: 'America/Toronto', MX: 'America/Mexico_City', BR: 'America/Sao_Paulo', AR: 'America/Argentina/Buenos_Aires', CL: 'America/Santiago', CO: 'America/Bogota', PE: 'America/Lima', UY: 'America/Montevideo',
  GB: 'Europe/London', UK: 'Europe/London', IE: 'Europe/Dublin', PT: 'Europe/Lisbon', ES: 'Europe/Madrid', FR: 'Europe/Paris', DE: 'Europe/Berlin', NL: 'Europe/Amsterdam', BE: 'Europe/Brussels', LU: 'Europe/Luxembourg', CH: 'Europe/Zurich', AT: 'Europe/Vienna', IT: 'Europe/Rome', DK: 'Europe/Copenhagen', SE: 'Europe/Stockholm', NO: 'Europe/Oslo', FI: 'Europe/Helsinki', IS: 'Atlantic/Reykjavik', EE: 'Europe/Tallinn', LV: 'Europe/Riga', LT: 'Europe/Vilnius', PL: 'Europe/Warsaw', CZ: 'Europe/Prague', SK: 'Europe/Bratislava', HU: 'Europe/Budapest', RO: 'Europe/Bucharest', BG: 'Europe/Sofia', GR: 'Europe/Athens', HR: 'Europe/Zagreb', SI: 'Europe/Ljubljana', RS: 'Europe/Belgrade', UA: 'Europe/Kyiv', TR: 'Europe/Istanbul', RU: 'Europe/Moscow', CY: 'Asia/Nicosia', MT: 'Europe/Malta',
  AE: 'Asia/Dubai', SA: 'Asia/Riyadh', QA: 'Asia/Qatar', KW: 'Asia/Kuwait', BH: 'Asia/Bahrain', OM: 'Asia/Muscat', IL: 'Asia/Jerusalem', JO: 'Asia/Amman', LB: 'Asia/Beirut', IR: 'Asia/Tehran', IQ: 'Asia/Baghdad',
  EG: 'Africa/Cairo', MA: 'Africa/Casablanca', TN: 'Africa/Tunis', DZ: 'Africa/Algiers', NG: 'Africa/Lagos', GH: 'Africa/Accra', KE: 'Africa/Nairobi', ET: 'Africa/Addis_Ababa', TZ: 'Africa/Dar_es_Salaam', UG: 'Africa/Kampala', RW: 'Africa/Kigali', ZA: 'Africa/Johannesburg', SN: 'Africa/Dakar', CI: 'Africa/Abidjan',
  IN: 'Asia/Kolkata', PK: 'Asia/Karachi', BD: 'Asia/Dhaka', LK: 'Asia/Colombo', NP: 'Asia/Kathmandu', KZ: 'Asia/Almaty', UZ: 'Asia/Tashkent',
  CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', MO: 'Asia/Macau', TW: 'Asia/Taipei', JP: 'Asia/Tokyo', KR: 'Asia/Seoul', MN: 'Asia/Ulaanbaatar',
  SG: 'Asia/Singapore', MY: 'Asia/Kuala_Lumpur', ID: 'Asia/Jakarta', TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh', PH: 'Asia/Manila', KH: 'Asia/Phnom_Penh', MM: 'Asia/Yangon', LA: 'Asia/Vientiane',
  AU: 'Australia/Sydney', NZ: 'Pacific/Auckland', FJ: 'Pacific/Fiji',
};

const byLength = obj => Object.keys(obj).sort((a, b) => b.length - a.length);
const CITY_KEYS = byLength(CITIES), REGION_KEYS = byLength(REGIONS), COUNTRY_KEYS = byLength(COUNTRIES);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (hay, word) => new RegExp('(^|[\\s,])' + escapeRe(word) + '(?=$|[\\s,.])').test(hay);

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !/^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$|^UTC$|^Etc\/GMT[+-]?\d*$/.test(tz)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (_) { return false; }
}

// location: free text. Returns an IANA zone or null.
export function guessTimeZone(location) {
  if (typeof location !== 'string' || !location.trim()) return null;
  const raw = location.trim();
  const norm = strip(raw);
  if (!norm) return null;
  const parts = raw.split(/\s*[,;/|·]\s*/).map(p => p.trim()).filter(Boolean);
  const upperCodes = parts.filter(p => /^[A-Z]{2}$/.test(p));
  const usContext = /(^|[\s,])(united states|usa|u\.s\.a?\.?)($|[\s,.])/.test(norm) || parts.some(p => p === 'US');

  for (const k of CITY_KEYS) if (hasWord(norm, k)) return CITIES[k];
  for (const k of REGION_KEYS) if (hasWord(norm, k)) return REGIONS[k];
  // Two-letter codes: in a US context (or when not the last part) they are states; otherwise ISO country codes.
  for (let i = 0; i < upperCodes.length; i++) {
    const code = upperCodes[i];
    const isLast = parts[parts.length - 1] === code;
    if ((usContext || !isLast) && US_CODES[code]) return US_CODES[code];
  }
  for (const k of COUNTRY_KEYS) if (hasWord(norm, k)) return COUNTRIES[k];
  for (const code of upperCodes) if (ISO[code]) return ISO[code];
  return null;
}

// "14:32" in the given zone, or null when the zone is unusable.
export function localTime(tz, now = new Date(), locale = undefined) {
  if (!isValidTimeZone(tz)) return null;
  try { return new Intl.DateTimeFormat(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now); } catch (_) { return null; }
}

// Whole hours between the zone and the viewer, e.g. +7 or -8 (0 when equal).
export function hourOffsetFrom(tz, viewerTz, now = new Date()) {
  if (!isValidTimeZone(tz) || !isValidTimeZone(viewerTz)) return null;
  const at = z => { const p = new Intl.DateTimeFormat('en-US', { timeZone: z, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now); const g = t => Number(p.find(x => x.type === t).value); return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')); };
  return Math.round((at(tz) - at(viewerTz)) / 3600000 * 2) / 2;
}
