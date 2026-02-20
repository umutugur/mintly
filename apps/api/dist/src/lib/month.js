import { ApiError } from '../errors.js';
const MONTH_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;
function parseMonth(value, fieldName) {
    const match = MONTH_REGEX.exec(value);
    if (!match) {
        throw new ApiError({
            code: 'VALIDATION_ERROR',
            message: `Invalid ${fieldName}. Expected YYYY-MM`,
            statusCode: 400,
        });
    }
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    return { year, monthIndex };
}
export function getMonthBoundaries(month, fieldName) {
    const parsed = parseMonth(month, fieldName);
    const start = new Date(Date.UTC(parsed.year, parsed.monthIndex, 1, 0, 0, 0, 0));
    const endExclusive = new Date(Date.UTC(parsed.year, parsed.monthIndex + 1, 1, 0, 0, 0, 0));
    return { start, endExclusive };
}
export function enumerateMonths(from, to) {
    const fromParsed = parseMonth(from, 'from');
    const toParsed = parseMonth(to, 'to');
    const fromComparable = fromParsed.year * 12 + fromParsed.monthIndex;
    const toComparable = toParsed.year * 12 + toParsed.monthIndex;
    if (fromComparable > toComparable) {
        throw new ApiError({
            code: 'VALIDATION_ERROR',
            message: '`from` must be less than or equal to `to`',
            statusCode: 400,
        });
    }
    const months = [];
    let cursorYear = fromParsed.year;
    let cursorMonth = fromParsed.monthIndex;
    while (cursorYear * 12 + cursorMonth <= toComparable) {
        months.push(`${cursorYear}-${String(cursorMonth + 1).padStart(2, '0')}`);
        cursorMonth += 1;
        if (cursorMonth > 11) {
            cursorMonth = 0;
            cursorYear += 1;
        }
    }
    return months;
}
