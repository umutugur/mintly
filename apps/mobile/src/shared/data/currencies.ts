export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string; // locale'e göre set edilmiş isim
}

interface CurrencyData {
  code: string;
  symbol: string;
  names: { en: string; tr: string; ru: string };
}

const CURRENCY_DATA: CurrencyData[] = [
  { code: 'TRY', symbol: '₺', names: { en: 'Turkish Lira', tr: 'Türk Lirası', ru: 'Турецкая лира' } },
  { code: 'USD', symbol: '$', names: { en: 'US Dollar', tr: 'Amerikan Doları', ru: 'Доллар США' } },
  { code: 'EUR', symbol: '€', names: { en: 'Euro', tr: 'Euro', ru: 'Евро' } },
  { code: 'GBP', symbol: '£', names: { en: 'British Pound', tr: 'İngiliz Sterlini', ru: 'Фунт стерлингов' } },
  { code: 'CHF', symbol: 'Fr', names: { en: 'Swiss Franc', tr: 'İsviçre Frangı', ru: 'Швейцарский франк' } },
  { code: 'SEK', symbol: 'kr', names: { en: 'Swedish Krona', tr: 'İsveç Kronası', ru: 'Шведская крона' } },
  { code: 'NOK', symbol: 'kr', names: { en: 'Norwegian Krone', tr: 'Norveç Kronası', ru: 'Норвежская крона' } },
  { code: 'DKK', symbol: 'kr', names: { en: 'Danish Krone', tr: 'Danimarka Kronası', ru: 'Датская крона' } },
  { code: 'PLN', symbol: 'zł', names: { en: 'Polish Zloty', tr: 'Polonya Zlotisi', ru: 'Польский злотый' } },
  { code: 'CZK', symbol: 'Kč', names: { en: 'Czech Koruna', tr: 'Çek Korunası', ru: 'Чешская крона' } },
  { code: 'HUF', symbol: 'Ft', names: { en: 'Hungarian Forint', tr: 'Macar Forinti', ru: 'Венгерский форинт' } },
  { code: 'RON', symbol: 'lei', names: { en: 'Romanian Leu', tr: 'Rumen Leyi', ru: 'Румынский лей' } },
  { code: 'BGN', symbol: 'лв', names: { en: 'Bulgarian Lev', tr: 'Bulgar Levası', ru: 'Болгарский лев' } },
  { code: 'HRK', symbol: 'kn', names: { en: 'Croatian Kuna', tr: 'Hırvat Kunası', ru: 'Хорватская куна' } },
  { code: 'RSD', symbol: 'din', names: { en: 'Serbian Dinar', tr: 'Sırp Dinarı', ru: 'Сербский динар' } },
  { code: 'UAH', symbol: '₴', names: { en: 'Ukrainian Hryvnia', tr: 'Ukrayna Grivnası', ru: 'Украинская гривна' } },
  { code: 'RUB', symbol: '₽', names: { en: 'Russian Ruble', tr: 'Rus Rublesi', ru: 'Российский рубль' } },
  { code: 'GEL', symbol: '₾', names: { en: 'Georgian Lari', tr: 'Gürcü Larisi', ru: 'Грузинский лари' } },
  { code: 'AZN', symbol: '₼', names: { en: 'Azerbaijani Manat', tr: 'Azerbaycan Manatı', ru: 'Азербайджанский манат' } },
  { code: 'CAD', symbol: 'CA$', names: { en: 'Canadian Dollar', tr: 'Kanada Doları', ru: 'Канадский доллар' } },
  { code: 'MXN', symbol: '$', names: { en: 'Mexican Peso', tr: 'Meksika Pesosu', ru: 'Мексиканское песо' } },
  { code: 'BRL', symbol: 'R$', names: { en: 'Brazilian Real', tr: 'Brezilya Reali', ru: 'Бразильский реал' } },
  { code: 'ARS', symbol: '$', names: { en: 'Argentine Peso', tr: 'Arjantin Pesosu', ru: 'Аргентинское песо' } },
  { code: 'CLP', symbol: '$', names: { en: 'Chilean Peso', tr: 'Şili Pesosu', ru: 'Чилийское песо' } },
  { code: 'COP', symbol: '$', names: { en: 'Colombian Peso', tr: 'Kolombiya Pesosu', ru: 'Колумбийское песо' } },
  { code: 'JPY', symbol: '¥', names: { en: 'Japanese Yen', tr: 'Japon Yeni', ru: 'Японская иена' } },
  { code: 'CNY', symbol: '¥', names: { en: 'Chinese Yuan', tr: 'Çin Yuanı', ru: 'Китайский юань' } },
  { code: 'KRW', symbol: '₩', names: { en: 'South Korean Won', tr: 'Güney Kore Wonu', ru: 'Южнокорейская вона' } },
  { code: 'INR', symbol: '₹', names: { en: 'Indian Rupee', tr: 'Hindistan Rupisi', ru: 'Индийская рупия' } },
  { code: 'SGD', symbol: 'S$', names: { en: 'Singapore Dollar', tr: 'Singapur Doları', ru: 'Сингапурский доллар' } },
  { code: 'HKD', symbol: 'HK$', names: { en: 'Hong Kong Dollar', tr: 'Hong Kong Doları', ru: 'Гонконгский доллар' } },
  { code: 'TWD', symbol: 'NT$', names: { en: 'Taiwan Dollar', tr: 'Tayvan Doları', ru: 'Тайваньский доллар' } },
  { code: 'THB', symbol: '฿', names: { en: 'Thai Baht', tr: 'Tayland Bahtı', ru: 'Тайский бат' } },
  { code: 'IDR', symbol: 'Rp', names: { en: 'Indonesian Rupiah', tr: 'Endonezya Rupiahı', ru: 'Индонезийская рупия' } },
  { code: 'MYR', symbol: 'RM', names: { en: 'Malaysian Ringgit', tr: 'Malezya Ringgiti', ru: 'Малайзийский ринггит' } },
  { code: 'PHP', symbol: '₱', names: { en: 'Philippine Peso', tr: 'Filipin Pesosu', ru: 'Филиппинское песо' } },
  { code: 'VND', symbol: '₫', names: { en: 'Vietnamese Dong', tr: 'Vietnam Dongu', ru: 'Вьетнамский донг' } },
  { code: 'PKR', symbol: '₨', names: { en: 'Pakistani Rupee', tr: 'Pakistan Rupisi', ru: 'Пакистанская рупия' } },
  { code: 'BDT', symbol: '৳', names: { en: 'Bangladeshi Taka', tr: 'Bangladeş Takası', ru: 'Бангладешская така' } },
  { code: 'AUD', symbol: 'A$', names: { en: 'Australian Dollar', tr: 'Avustralya Doları', ru: 'Австралийский доллар' } },
  { code: 'NZD', symbol: 'NZ$', names: { en: 'New Zealand Dollar', tr: 'Yeni Zelanda Doları', ru: 'Новозеландский доллар' } },
  { code: 'SAR', symbol: '﷼', names: { en: 'Saudi Riyal', tr: 'Suudi Riyali', ru: 'Саудовский риял' } },
  { code: 'AED', symbol: 'د.إ', names: { en: 'UAE Dirham', tr: 'BAE Dirhemi', ru: 'Дирхам ОАЭ' } },
  { code: 'QAR', symbol: '﷼', names: { en: 'Qatari Riyal', tr: 'Katar Riyali', ru: 'Катарский риял' } },
  { code: 'KWD', symbol: 'د.ك', names: { en: 'Kuwaiti Dinar', tr: 'Kuveyt Dinarı', ru: 'Кувейтский динар' } },
  { code: 'BHD', symbol: '.د.ب', names: { en: 'Bahraini Dinar', tr: 'Bahreyn Dinarı', ru: 'Бахрейнский динар' } },
  { code: 'OMR', symbol: '﷼', names: { en: 'Omani Rial', tr: 'Umman Riyali', ru: 'Оманский риал' } },
  { code: 'JOD', symbol: 'JD', names: { en: 'Jordanian Dinar', tr: 'Ürdün Dinarı', ru: 'Иорданский динар' } },
  { code: 'EGP', symbol: '£', names: { en: 'Egyptian Pound', tr: 'Mısır Lirası', ru: 'Египетский фунт' } },
  { code: 'NGN', symbol: '₦', names: { en: 'Nigerian Naira', tr: 'Nijerya Nairası', ru: 'Нигерийская найра' } },
  { code: 'ZAR', symbol: 'R', names: { en: 'South African Rand', tr: 'Güney Afrika Randı', ru: 'Южноафриканский рэнд' } },
  { code: 'KES', symbol: 'KSh', names: { en: 'Kenyan Shilling', tr: 'Kenya Şilini', ru: 'Кенийский шиллинг' } },
  { code: 'GHS', symbol: '₵', names: { en: 'Ghanaian Cedi', tr: 'Gana Sedisi', ru: 'Ганский седи' } },
  { code: 'MAD', symbol: 'MAD', names: { en: 'Moroccan Dirham', tr: 'Fas Dirhemi', ru: 'Марокканский дирхам' } },
  { code: 'ILS', symbol: '₪', names: { en: 'Israeli Shekel', tr: 'İsrail Şekeli', ru: 'Израильский шекель' } },
  { code: 'IRR', symbol: '﷼', names: { en: 'Iranian Rial', tr: 'İran Riyali', ru: 'Иранский риал' } },
  { code: 'AFN', symbol: '؋', names: { en: 'Afghan Afghani', tr: 'Afgan Afganisi', ru: 'Афганский афгани' } },
  { code: 'UZS', symbol: 'сўм', names: { en: 'Uzbek Som', tr: 'Özbek Somu', ru: 'Узбекский сум' } },
  { code: 'KZT', symbol: '₸', names: { en: 'Kazakhstani Tenge', tr: 'Kazak Tengesi', ru: 'Казахстанский тенге' } },
  { code: 'AMD', symbol: '֏', names: { en: 'Armenian Dram', tr: 'Ermeni Dramı', ru: 'Армянский драм' } },
];

function resolveLocale(locale: string): 'en' | 'tr' | 'ru' {
  if (locale === 'tr') return 'tr';
  if (locale === 'ru') return 'ru';
  return 'en';
}

export function getCurrencies(locale: string): CurrencyOption[] {
  const lang = resolveLocale(locale);
  // Deduplicate by code
  const seen = new Set<string>();
  return CURRENCY_DATA
    .filter((c) => {
      if (seen.has(c.code)) return false;
      seen.add(c.code);
      return true;
    })
    .map((c) => ({
      code: c.code,
      symbol: c.symbol,
      name: c.names[lang],
    }));
}

// Backward compat: default English list
export const CURRENCIES: CurrencyOption[] = getCurrencies('en');

export function findCurrency(code: string): CurrencyOption | undefined {
  return CURRENCIES.find((c) => c.code === code.trim().toUpperCase());
}

export function formatCurrencyOption(c: CurrencyOption): string {
  return `${c.symbol}  ${c.code} — ${c.name}`;
}
