export const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const BRAZIL_UTC_OFFSET = "-03:00";

type BrazilDateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function getBrazilDateParts(value: Date | string | number = new Date()): BrazilDateParts {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));

  const parts: BrazilDateParts = {
    year: "1970",
    month: "01",
    day: "01",
    hour: "00",
    minute: "00",
    second: "00",
  };

  for (const part of formatted) {
    if (part.type in parts) {
      parts[part.type as keyof BrazilDateParts] = part.value;
    }
  }

  return parts;
}

export function getBrazilNow(): Date {
  const parts = getBrazilDateParts();

  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

export function getBrazilDateKey(value: Date | string | number = new Date()): string {
  const parts = getBrazilDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getBrazilDayBounds(value: Date | string | number = new Date()) {
  const day = getBrazilDateKey(value);

  return {
    day,
    start: `${day}T00:00:00${BRAZIL_UTC_OFFSET}`,
    end: `${day}T23:59:59.999${BRAZIL_UTC_OFFSET}`,
  };
}

export function formatBrazilTime(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(new Date(value));
}