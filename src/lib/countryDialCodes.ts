// Mapeamento de DDI (código de discagem internacional) → país + bandeira (emoji)
// Resolução pelo prefixo mais longo encontrado nos dígitos.

export interface CountryInfo {
  code: string;       // DDI (ex: "55", "353", "1")
  name: string;       // Nome curto em pt-BR
  flag: string;       // Emoji da bandeira
  iso2: string;       // Código ISO de 2 letras
  example?: string;   // Exemplo de número formatado (sem +)
}

// Lista enxuta dos principais países; ordenada por DDI para iteração estável.
// Inclui prefixos compartilhados via NANP (1) — todos retornam EUA por padrão.
export const COUNTRIES: CountryInfo[] = [
  { code: "1",   iso2: "US", name: "EUA / Canadá", flag: "🇺🇸", example: "1 415 5550100" },
  { code: "7",   iso2: "RU", name: "Rússia",        flag: "🇷🇺", example: "7 912 3456789" },
  { code: "20",  iso2: "EG", name: "Egito",         flag: "🇪🇬", example: "20 100 1234567" },
  { code: "27",  iso2: "ZA", name: "África do Sul", flag: "🇿🇦", example: "27 71 1234567" },
  { code: "30",  iso2: "GR", name: "Grécia",        flag: "🇬🇷", example: "30 690 1234567" },
  { code: "31",  iso2: "NL", name: "Holanda",       flag: "🇳🇱", example: "31 6 12345678" },
  { code: "32",  iso2: "BE", name: "Bélgica",       flag: "🇧🇪", example: "32 470 123456" },
  { code: "33",  iso2: "FR", name: "França",        flag: "🇫🇷", example: "33 6 12345678" },
  { code: "34",  iso2: "ES", name: "Espanha",       flag: "🇪🇸", example: "34 612 345678" },
  { code: "36",  iso2: "HU", name: "Hungria",       flag: "🇭🇺", example: "36 30 1234567" },
  { code: "39",  iso2: "IT", name: "Itália",        flag: "🇮🇹", example: "39 312 3456789" },
  { code: "40",  iso2: "RO", name: "Romênia",       flag: "🇷🇴", example: "40 712 345678" },
  { code: "41",  iso2: "CH", name: "Suíça",         flag: "🇨🇭", example: "41 78 1234567" },
  { code: "43",  iso2: "AT", name: "Áustria",       flag: "🇦🇹", example: "43 660 1234567" },
  { code: "44",  iso2: "GB", name: "Reino Unido",   flag: "🇬🇧", example: "44 7400 123456" },
  { code: "45",  iso2: "DK", name: "Dinamarca",     flag: "🇩🇰", example: "45 20 123456" },
  { code: "46",  iso2: "SE", name: "Suécia",        flag: "🇸🇪", example: "46 70 1234567" },
  { code: "47",  iso2: "NO", name: "Noruega",       flag: "🇳🇴", example: "47 406 12345" },
  { code: "48",  iso2: "PL", name: "Polônia",       flag: "🇵🇱", example: "48 512 345678" },
  { code: "49",  iso2: "DE", name: "Alemanha",      flag: "🇩🇪", example: "49 151 23456789" },
  { code: "51",  iso2: "PE", name: "Peru",          flag: "🇵🇪", example: "51 912 345678" },
  { code: "52",  iso2: "MX", name: "México",        flag: "🇲🇽", example: "52 55 12345678" },
  { code: "53",  iso2: "CU", name: "Cuba",          flag: "🇨🇺", example: "53 5 1234567" },
  { code: "54",  iso2: "AR", name: "Argentina",     flag: "🇦🇷", example: "54 9 11 12345678" },
  { code: "55",  iso2: "BR", name: "Brasil",        flag: "🇧🇷", example: "55 11 999999999" },
  { code: "56",  iso2: "CL", name: "Chile",         flag: "🇨🇱", example: "56 9 12345678" },
  { code: "57",  iso2: "CO", name: "Colômbia",      flag: "🇨🇴", example: "57 312 3456789" },
  { code: "58",  iso2: "VE", name: "Venezuela",     flag: "🇻🇪", example: "58 412 1234567" },
  { code: "60",  iso2: "MY", name: "Malásia",       flag: "🇲🇾", example: "60 12 3456789" },
  { code: "61",  iso2: "AU", name: "Austrália",     flag: "🇦🇺", example: "61 412 345678" },
  { code: "62",  iso2: "ID", name: "Indonésia",     flag: "🇮🇩", example: "62 812 3456789" },
  { code: "63",  iso2: "PH", name: "Filipinas",     flag: "🇵🇭", example: "63 905 1234567" },
  { code: "64",  iso2: "NZ", name: "Nova Zelândia", flag: "🇳🇿", example: "64 21 1234567" },
  { code: "65",  iso2: "SG", name: "Singapura",     flag: "🇸🇬", example: "65 8123 4567" },
  { code: "66",  iso2: "TH", name: "Tailândia",     flag: "🇹🇭", example: "66 81 2345678" },
  { code: "81",  iso2: "JP", name: "Japão",         flag: "🇯🇵", example: "81 90 12345678" },
  { code: "82",  iso2: "KR", name: "Coreia do Sul", flag: "🇰🇷", example: "82 10 12345678" },
  { code: "84",  iso2: "VN", name: "Vietnã",        flag: "🇻🇳", example: "84 91 2345678" },
  { code: "86",  iso2: "CN", name: "China",         flag: "🇨🇳", example: "86 131 12345678" },
  { code: "90",  iso2: "TR", name: "Turquia",       flag: "🇹🇷", example: "90 532 1234567" },
  { code: "91",  iso2: "IN", name: "Índia",         flag: "🇮🇳", example: "91 91234 56789" },
  { code: "92",  iso2: "PK", name: "Paquistão",     flag: "🇵🇰", example: "92 301 2345678" },
  { code: "93",  iso2: "AF", name: "Afeganistão",   flag: "🇦🇫", example: "93 70 1234567" },
  { code: "94",  iso2: "LK", name: "Sri Lanka",     flag: "🇱🇰", example: "94 71 1234567" },
  { code: "95",  iso2: "MM", name: "Mianmar",       flag: "🇲🇲", example: "95 9 123456789" },
  { code: "98",  iso2: "IR", name: "Irã",           flag: "🇮🇷", example: "98 912 1234567" },
  { code: "212", iso2: "MA", name: "Marrocos",      flag: "🇲🇦", example: "212 612 345678" },
  { code: "213", iso2: "DZ", name: "Argélia",       flag: "🇩🇿", example: "213 551 234567" },
  { code: "234", iso2: "NG", name: "Nigéria",       flag: "🇳🇬", example: "234 802 1234567" },
  { code: "351", iso2: "PT", name: "Portugal",      flag: "🇵🇹", example: "351 912 345678" },
  { code: "352", iso2: "LU", name: "Luxemburgo",    flag: "🇱🇺", example: "352 621 123456" },
  { code: "353", iso2: "IE", name: "Irlanda",       flag: "🇮🇪", example: "353 85 1234567" },
  { code: "354", iso2: "IS", name: "Islândia",      flag: "🇮🇸", example: "354 611 2345" },
  { code: "358", iso2: "FI", name: "Finlândia",     flag: "🇫🇮", example: "358 41 2345678" },
  { code: "359", iso2: "BG", name: "Bulgária",      flag: "🇧🇬", example: "359 87 1234567" },
  { code: "370", iso2: "LT", name: "Lituânia",      flag: "🇱🇹", example: "370 612 34567" },
  { code: "371", iso2: "LV", name: "Letônia",       flag: "🇱🇻", example: "371 21 234567" },
  { code: "372", iso2: "EE", name: "Estônia",       flag: "🇪🇪", example: "372 512 3456" },
  { code: "380", iso2: "UA", name: "Ucrânia",       flag: "🇺🇦", example: "380 67 1234567" },
  { code: "385", iso2: "HR", name: "Croácia",       flag: "🇭🇷", example: "385 91 1234567" },
  { code: "420", iso2: "CZ", name: "Tchéquia",      flag: "🇨🇿", example: "420 601 234567" },
  { code: "421", iso2: "SK", name: "Eslováquia",    flag: "🇸🇰", example: "421 905 123456" },
  { code: "503", iso2: "SV", name: "El Salvador",   flag: "🇸🇻", example: "503 7012 3456" },
  { code: "504", iso2: "HN", name: "Honduras",      flag: "🇭🇳", example: "504 9123 4567" },
  { code: "505", iso2: "NI", name: "Nicarágua",     flag: "🇳🇮", example: "505 8123 4567" },
  { code: "506", iso2: "CR", name: "Costa Rica",    flag: "🇨🇷", example: "506 8123 4567" },
  { code: "507", iso2: "PA", name: "Panamá",        flag: "🇵🇦", example: "507 6123 4567" },
  { code: "591", iso2: "BO", name: "Bolívia",       flag: "🇧🇴", example: "591 712 34567" },
  { code: "593", iso2: "EC", name: "Equador",       flag: "🇪🇨", example: "593 99 1234567" },
  { code: "595", iso2: "PY", name: "Paraguai",      flag: "🇵🇾", example: "595 961 234567" },
  { code: "598", iso2: "UY", name: "Uruguai",       flag: "🇺🇾", example: "598 94 123456" },
  { code: "852", iso2: "HK", name: "Hong Kong",     flag: "🇭🇰", example: "852 5123 4567" },
  { code: "855", iso2: "KH", name: "Camboja",       flag: "🇰🇭", example: "855 91 234567" },
  { code: "880", iso2: "BD", name: "Bangladesh",    flag: "🇧🇩", example: "880 171 2345678" },
  { code: "886", iso2: "TW", name: "Taiwan",        flag: "🇹🇼", example: "886 912 345678" },
  { code: "971", iso2: "AE", name: "Emirados Árabes", flag: "🇦🇪", example: "971 50 1234567" },
  { code: "972", iso2: "IL", name: "Israel",        flag: "🇮🇱", example: "972 50 1234567" },
  { code: "974", iso2: "QA", name: "Catar",         flag: "🇶🇦", example: "974 33 123456" },
  { code: "976", iso2: "MN", name: "Mongólia",      flag: "🇲🇳", example: "976 8812 3456" },
  { code: "977", iso2: "NP", name: "Nepal",         flag: "🇳🇵", example: "977 981 1234567" },
];

// Mapa indexado para busca rápida.
const BY_CODE: Record<string, CountryInfo> = COUNTRIES.reduce((acc, c) => {
  acc[c.code] = c;
  return acc;
}, {} as Record<string, CountryInfo>);

// Detecta o país a partir dos dígitos puros (sem "+", sem espaços).
// Tenta o prefixo mais longo (4→3→2→1).
export function detectCountryFromDigits(digits: string): CountryInfo | null {
  const clean = digits.replace(/\D/g, "");
  if (!clean) return null;
  for (let len = Math.min(4, clean.length); len >= 1; len--) {
    const prefix = clean.slice(0, len);
    if (BY_CODE[prefix]) return BY_CODE[prefix];
  }
  return null;
}

// Formata um número internacional de forma legível: "+DDI XXXX XXXX..."
// Estratégia simples: "+DDI" depois agrupa o restante em blocos de 4 dígitos
// (com tratamento especial para BR: "+55 DD XXXXX-XXXX").
export function formatInternationalPhone(digits: string): string {
  const raw = digits.replace(/\D/g, "");
  if (!raw) return "";
  const country = detectCountryFromDigits(raw);
  if (!country) return `+${raw}`;
  const ddi = country.code;
  const rest = raw.slice(ddi.length);
  if (!rest) return `+${ddi}`;

  // Brasil: +55 DD XXXXX-XXXX
  if (ddi === "55") {
    const dd = rest.slice(0, 2);
    const body = rest.slice(2);
    if (!body) return `+${ddi} ${dd}`;
    if (body.length <= 5) return `+${ddi} ${dd} ${body}`;
    return `+${ddi} ${dd} ${body.slice(0, body.length - 4)}-${body.slice(body.length - 4)}`;
  }

  // Genérico: agrupa em blocos de 3 e 4 dígitos
  if (rest.length <= 4) return `+${ddi} ${rest}`;
  if (rest.length <= 7) return `+${ddi} ${rest.slice(0, 3)} ${rest.slice(3)}`;
  // 8+ dígitos: blocos de 3-4-resto
  return `+${ddi} ${rest.slice(0, 3)} ${rest.slice(3, 7)} ${rest.slice(7)}`.trim();
}

const LAST_DDI_KEY = "wa:last-ddi";

export function getLastUsedDDI(): string {
  try { return localStorage.getItem(LAST_DDI_KEY) || ""; } catch { return ""; }
}

export function saveLastUsedDDI(ddi: string): void {
  try { if (ddi) localStorage.setItem(LAST_DDI_KEY, ddi); } catch { /* ignore */ }
}

export function getCountryByCode(code: string): CountryInfo | null {
  return BY_CODE[code] || null;
}
