const MONTH_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;

function parseMonthParts(month: string): { year: number; monthIndex: number } {
  const match = MONTH_REGEX.exec(month);
  if (!match) {
    throw new Error(`Invalid month value: ${month}`);
  }

  return {
    year: Number(match[1]),
    monthIndex: Number(match[2]) - 1,
  };
}

export function getCurrentMonthString(): string {
  return toMonthString(new Date());
}

export function toMonthString(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function monthFromIsoString(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return getCurrentMonthString();
  }

  return toMonthString(date);
}

export function shiftMonth(month: string, delta: number): string {
  const parsed = parseMonthParts(month);
  const moved = new Date(Date.UTC(parsed.year, parsed.monthIndex + delta, 1, 0, 0, 0, 0));
  return toMonthString(moved);
}

export function formatMonthLabel(month: string): string {
  const parsed = parseMonthParts(month);
  const date = new Date(Date.UTC(parsed.year, parsed.monthIndex, 1, 0, 0, 0, 0));
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function getTrendRange(month: string, span: number): { from: string; to: string } {
  return {
    from: shiftMonth(month, -(span - 1)),
    to: month,
  };
}
